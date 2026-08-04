import {
  type GeminiCategoryClassifier,
  LlmProviderError,
  TREND_ANALYSIS_PROMPT_VERSION,
  type TrendAnalysisProvider,
  type TrendEvidence,
} from "@ai-trend-radar/llm";
import { selectPendingAnalyses } from "./analysis-queue";
import { extractEntityCandidate } from "./candidate";
import { calculateInitialTrendScore } from "./initial-score";
import { planRateLimitWait } from "./rate-limit-wait";
import type { SupabasePipelineRepository } from "./repository";
import type { EntityCandidate } from "./schema";

interface ProcessedGroup {
  entity: Awaited<ReturnType<SupabasePipelineRepository["upsertCandidate"]>>;
  candidates: EntityCandidate[];
  score: ReturnType<typeof calculateInitialTrendScore>;
}

export function toEvidenceExcerpt(body: string | null, fallback: string) {
  return (body?.trim() || fallback).slice(0, 2_000);
}

const sleep = (ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms); });

function toEvidence(group: ProcessedGroup, now: Date): TrendEvidence {
  // 스키마 상한(<=20)에 맞춰 자른다. mention이 많은 엔티티는 dedup 후에도 20개를 넘을 수 있어
  // 자르지 않으면 분석 입력 검증이 매번 실패해 해당 후보가 영영 분석되지 않는다.
  const officialFacts = [...new Set(group.candidates.flatMap((candidate) => candidate.officialFacts))].slice(0, 20);
  return {
    name: group.entity.name,
    category: group.candidates[0]?.categorySlug ?? "other",
    canonicalUrl: group.entity.canonical_url,
    observedAt: now.toISOString(),
    officialFacts,
    sources: group.candidates.slice(0, 12).map((candidate) => ({
      source: candidate.source,
      url: candidate.rawItem.url,
      title: candidate.rawItem.title,
      excerpt: toEvidenceExcerpt(candidate.rawItem.body, `${candidate.rawItem.title}의 공개 지표를 수집했습니다.`),
      metrics: candidate.metrics,
    })),
  };
}

export async function runEntityPipeline(options: {
  repository: SupabasePipelineRepository;
  now?: Date;
  analysisProvider?: TrendAnalysisProvider;
  categoryClassifier?: GeminiCategoryClassifier;
  analysisLimit?: number;
  autoApproveAnalyzed?: boolean;
}) {
  const now = options.now ?? new Date();
  await options.repository.initialize();
  const rawItems = await options.repository.loadRawItems();
  const candidates = rawItems
    .map(extractEntityCandidate)
    .filter((candidate): candidate is EntityCandidate => candidate !== null)
    .sort((a, b) => {
      if (a.source !== b.source) return a.source === "github" ? -1 : 1;
      return b.confidence - a.confidence;
    });

  const grouped = new Map<string, { entity: ProcessedGroup["entity"]; candidates: EntityCandidate[] }>();
  for (const candidate of candidates) {
    const entity = await options.repository.upsertCandidate(candidate);
    const current = grouped.get(entity.id);
    if (current) current.candidates.push(candidate);
    else grouped.set(entity.id, { entity, candidates: [candidate] });
  }

  const processed: ProcessedGroup[] = [];
  const scoreDate = now.toISOString().slice(0, 10);
  for (const group of grouped.values()) {
    const score = calculateInitialTrendScore(group.candidates, now);
    await options.repository.saveScore(group.entity.id, score, scoreDate);
    processed.push({ ...group, score });
  }
  processed.sort((a, b) => b.score.totalScore - a.score.totalScore || b.score.trustScore - a.score.trustScore);

  let analysesCreated = 0;
  let analysesSkipped = 0;
  let analysisStoppedReason: "RATE_LIMIT" | "AUTH" | "CONFIG" | null = null;
  let lastRateLimitAt: string | null = null;
  const analysisErrors: Array<{ entity: string; error: string }> = [];
  const analysisQueue = { unanalyzed: 0, stale: 0, selected: 0, remaining: 0 };
  // 이번 실행에서 분석에 성공한 엔티티 목록. 분석 후 한 번의 배치 호출로 카테고리를 재분류한다.
  const analyzedForCategory: { entityId: string; name: string; description: string }[] = [];
  let rateLimitWaitedMs = 0;
  let stoppedEarly = false;
  if (options.analysisProvider) {
    const limit = Math.max(0, options.analysisLimit ?? 50);
    const staleThreshold = now.getTime() - 24 * 3_600_000;
    const latestAnalysisAt = await options.repository.loadLatestAnalysisAt(
      processed.map((group) => group.entity.id),
      TREND_ANALYSIS_PROMPT_VERSION,
    );
    // 우선순위: 미분석 review 후보 → 오래된 public 재분석. 보류(private) 후보는 제외.
    const queue = selectPendingAnalyses(processed, limit, (group) => {
      if (group.entity.visibility === "private") return "excluded";
      const latest = latestAnalysisAt.get(group.entity.id);
      if (latest === undefined) return "unanalyzed";
      return latest < staleThreshold ? "stale" : "recent";
    });
    analysesSkipped = queue.skipped;
    analysisQueue.unanalyzed = queue.unanalyzed;
    analysisQueue.stale = queue.stale;
    analysisQueue.selected = queue.pending.length;
    analysisQueue.remaining = queue.remaining;
    for (const group of queue.pending) {
      // 분당 한도에 걸리면 서버가 알려준 만큼 기다렸다 같은 후보를 한 번 더 시도한다.
      // 예산(누적 대기 시간)을 넘기면 이번 실행을 끝내고 다음 주기에 맡긴다.
      let attempted = false;
      while (!attempted) {
        attempted = true;
        try {
          const result = await options.analysisProvider.analyze(toEvidence(group, now));
          await options.repository.saveAnalysis(group.entity.id, result);
          analysesCreated += 1;
          // 한국어 요약은 카테고리 분류에 좋은 신호라 분류 입력으로 쓴다.
          analyzedForCategory.push({ entityId: group.entity.id, name: group.entity.name, description: result.analysis.summary });
        } catch (error) {
          analysisErrors.push({
            entity: group.entity.slug,
            error: error instanceof Error ? error.message : "Unknown analysis failure",
          });
          if (error instanceof LlmProviderError && (
            error.code === "RATE_LIMIT" || error.code === "AUTH" || error.code === "CONFIG"
          )) {
            if (error.code === "RATE_LIMIT") {
              lastRateLimitAt = new Date().toISOString();
              const plan = planRateLimitWait({ retryAfterMs: error.retryAfterMs, waitedMs: rateLimitWaitedMs });
              if (plan) {
                rateLimitWaitedMs += plan.waitMs;
                await sleep(plan.waitMs);
                attempted = false; // 같은 후보를 다시 시도한다.
                continue;
              }
            }
            analysisStoppedReason = error.code;
            stoppedEarly = true;
          }
        }
      }
      if (stoppedEarly) break;
    }
    // 이번 실행에서 처리하지 못하고 남은 대기 후보 수(중단으로 처리 못 한 pending 포함).
    analysisQueue.remaining += queue.pending.length - analysesCreated;
  }

  // 분석된 엔티티들의 카테고리를 LLM으로 재분류(배치 1콜 위주). 실패해도 파이프라인은 계속 진행한다.
  let categoriesUpdated = 0;
  if (options.categoryClassifier && analyzedForCategory.length > 0) {
    try {
      const classified = await options.categoryClassifier.classify(
        analyzedForCategory.map((item, index) => ({ index, name: item.name, description: item.description })),
        { taxonomy: options.repository.getCategoryTaxonomy() },
      );
      for (const { index, categorySlug } of classified) {
        const target = analyzedForCategory[index];
        if (!target) continue;
        if (await options.repository.assignCategoryBySlug(target.entityId, categorySlug)) categoriesUpdated += 1;
      }
    } catch (error) {
      analysisErrors.push({ entity: "category-classify", error: error instanceof Error ? error.message : "Unknown classify failure" });
    }
  }

  const autoApproved = options.autoApproveAnalyzed === false
    ? 0
    : await options.repository.autoApproveAnalyzedCandidates();

  return {
    rawItemsRead: rawItems.length,
    candidatesAccepted: candidates.length,
    candidatesRejected: rawItems.length - candidates.length,
    entitiesProcessed: processed.length,
    scoresCreated: processed.length,
    analysesCreated,
    analysesSkipped,
    categoriesUpdated,
    analysisErrors,
    analysisStoppedReason,
    lastRateLimitAt,
    // 분당 한도에 걸려 기다린 누적 시간. 0보다 크면 즉시 중단 대신 기다려서 더 처리했다는 뜻이다.
    rateLimitWaitedMs,
    analysisQueue,
    autoApproved,
    leaders: processed.slice(0, 10).map((group) => ({
      id: group.entity.id,
      slug: group.entity.slug,
      name: group.entity.name,
      score: group.score.totalScore,
      trustScore: group.score.trustScore,
      status: group.score.status,
      sources: [...new Set(group.candidates.map((candidate) => candidate.source))],
    })),
  };
}
