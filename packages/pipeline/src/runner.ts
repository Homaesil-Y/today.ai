import {
  type GeminiCategoryClassifier,
  LlmProviderError,
  TREND_ANALYSIS_PROMPT_VERSION,
  type TrendAnalysisProvider,
  type TrendEvidence,
} from "@ai-trend-radar/llm";
import { selectPendingAnalyses } from "./analysis-queue";
import { extractEntityCandidate } from "./candidate";
import { ScoreDistributions } from "./engagement-percentile";
import { BOOTSTRAP_SCORING_VERSION, calculateInitialTrendScore, commentValue, engagementValue } from "./initial-score";
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

/**
 * 재분석 주기(시간). verify:live 의 백로그 지표도 이 값을 기준으로 삼는다.
 */
export const REANALYSIS_INTERVAL_HOURS = 120;

/**
 * 분석 요청 사이 최소 간격(ms).
 *
 * Gemini 무료 등급은 분당 15회다(`generate_content_free_tier_requests, limit: 15`). 예전엔 간격
 * 없이 최대한 빨리 쏘다가 한도에 부딪히면 서버가 알려준 만큼(30~55초) 기다렸다. 2026-09-15 실측:
 * 실행마다 rateLimitWaitedMs 가 54초였고 상한 50건을 못 채워 39~46건에서 끝났다.
 *
 * 4.2초 간격이면 분당 14.3회로 한도 아래에 머물러 대기가 발생하지 않는다. 상한 50건을 다 채워도
 * 210초라 분석 예산(11분) 안에 넉넉히 들어간다. 한도에 부딪힌 뒤 기다리는 기존 경로는 그대로
 * 남겨둔다 — 다른 워크플로와 겹쳐 실행되는 등 예측 못 한 상황의 안전망이다.
 */
export const ANALYSIS_MIN_INTERVAL_MS = 4_200;

/** 일시적 공급자 오류 후 같은 후보를 다시 시도하기 전 대기(ms). */
export const UPSTREAM_RETRY_DELAY_MS = 5_000;

/**
 * 공급자 오류 뒤 같은 후보를 한 번 더 시도할지.
 *
 * UPSTREAM 이면서 retryable 인 것만(503 high demand·타임아웃·연결 실패). RATE_LIMIT 은 서버가 알려준
 * 대기 시간을 따르는 별도 경로가 있고, AUTH·CONFIG·INVALID_OUTPUT 은 다시 해도 같다. 후보당 한 번만,
 * 그리고 대기 후에도 예산이 남을 때만.
 */
export function planUpstreamRetry(params: { error: unknown; alreadyRetried: boolean; remainingMs: number }): boolean {
  const { error, alreadyRetried, remainingMs } = params;
  if (alreadyRetried) return false;
  if (!(error instanceof LlmProviderError)) return false;
  if (error.code !== "UPSTREAM" || !error.retryable) return false;
  return remainingMs > UPSTREAM_RETRY_DELAY_MS + ANALYSIS_MIN_INTERVAL_MS;
}

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
  /**
   * 분석을 이 시각까지만 진행한다. 넘기면 남은 후보는 다음 주기에 맡기고 자동 승인으로 넘어간다.
   * 잡 타임아웃에 걸려 프로세스가 죽으면 분석을 저장해두고도 공개가 안 되기 때문에 필요하다.
   */
  analysisDeadline?: Date;
  /**
   * 엔티티·점수를 다시 쓰지 않고 기존 엔티티에 읽기 전용 매칭만 해서 분석에 집중한다.
   *
   * 분석 재시도 워크플로가 매 실행 전체 후보를 순차 upsert(후보당 3~4회 DB 왕복)하는 데
   * 5~10분을 쓰는데, 그 쓰기는 30분 전 수집 워크플로가 이미 한 일의 반복이다. 실측으로
   * upsert 단계가 10분을 먹어 분석 예산이 시작 전에 소진된 실행(분석 0건)이 있었다.
   * 이 모드에서 매칭되지 않는 신규 후보는 건너뛴다 — 생성은 수집 워크플로의 몫이다.
   */
  analysisOnly?: boolean;
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
  let candidatesUnmatched = 0;
  for (const candidate of candidates) {
    const entity = options.analysisOnly
      ? options.repository.matchEntity(candidate)
      : await options.repository.upsertCandidate(candidate);
    if (!entity) {
      candidatesUnmatched += 1;
      continue;
    }
    const current = grouped.get(entity.id);
    if (current) current.candidates.push(candidate);
    else grouped.set(entity.id, { entity, candidates: [candidate] });
  }

  // 반응 지표는 채널별 척도가 달라(HN points 중앙값 2, PH votes 중앙값 194) 절대값을 비교할 수
  // 없다. 이번 실행에서 수집한 후보 전체로 채널별 분포를 만들어 상대 순위로 환산한다.
  const distributions = new ScoreDistributions(
    candidates.map((candidate) => ({
      source: candidate.source,
      engagement: engagementValue(candidate),
      comments: commentValue(candidate),
    })),
  );

  // 후보 루프에서 모아둔 alias·mention·metric 을 배치로 저장한다. 분석 단계보다 앞에서 비워야
  // 한다 — 분석은 마감 시각에 걸려 중간에 끝날 수 있고, 그때도 이번 수집분은 저장돼 있어야 한다.
  const candidateWrites = await options.repository.flushCandidateWrites();

  const processed: ProcessedGroup[] = [];
  const scoreDate = now.toISOString().slice(0, 10);
  // 상태 판정(RISING/FALLING/PEAK 등)은 직전 스냅샷과 비교해야 한다.
  // 분석 전용 실행은 점수를 저장하지 않고, 대기열 정렬은 총점만 쓰므로 상태가 필요 없다. 그래서 이력을
  // 읽지 않는다 — 하루 8회 이상 도는 분석 실행이 매번 점수 이력 전체를 받아 egress 를 태웠다
  // (2026-10-06 Supabase egress 한도 초과로 프로젝트 차단). 이 경우 로그의 leaders.status 는 WATCH 로 나온다.
  const scoreHistory = options.analysisOnly
    ? new Map<string, { previousSignal: number; dataPoints: number }>()
    : await options.repository.loadScoreHistory([...grouped.keys()], scoreDate, BOOTSTRAP_SCORING_VERSION);
  for (const group of grouped.values()) {
    // 점수는 대기열 우선순위 정렬에 필요해 항상 계산한다(분석 대기열 정렬에 쓴다).
    const score = calculateInitialTrendScore(group.candidates, now, distributions, scoreHistory.get(group.entity.id));
    processed.push({ ...group, score });
  }
  // 점수 저장은 한 번에 묶는다. 분석 전용 실행에서는 저장하지 않는다(수집 워크플로가 이미 같은
  // 날짜로 저장했다).
  if (!options.analysisOnly) {
    await options.repository.saveScores(
      processed.map((group) => ({ entityId: group.entity.id, score: group.score })),
      scoreDate,
    );
  }
  processed.sort((a, b) => b.score.totalScore - a.score.totalScore || b.score.trustScore - a.score.trustScore);

  let analysesCreated = 0;
  let analysesSkipped = 0;
  let analysisStoppedReason: "RATE_LIMIT" | "AUTH" | "CONFIG" | "DEADLINE" | null = null;
  let lastRateLimitAt: string | null = null;
  const analysisErrors: Array<{ entity: string; error: string }> = [];
  const analysisQueue = { unanalyzed: 0, stale: 0, selected: 0, remaining: 0 };
  // 이번 실행에서 분석에 성공한 엔티티 목록. 분석 후 한 번의 배치 호출로 카테고리를 재분류한다.
  const analyzedForCategory: { entityId: string; name: string; description: string }[] = [];
  let rateLimitWaitedMs = 0;
  let upstreamRetries = 0;
  let stoppedEarly = false;
  if (options.analysisProvider) {
    const limit = Math.max(0, options.analysisLimit ?? 50);
    // 재분석 주기. 24시간이었을 때는 공개 엔티티 수(458건, 하루 +20~26 증가)만큼이 매일 대기열로
    // 되돌아와 자연 처리량(하루 76~145건)으로는 영구히 따라잡을 수 없었다. 재분석이 갱신하는 건
    // 상세 페이지의 요약·인사이트 텍스트뿐이고 순위·점수는 LLM 없이 매 실행 갱신된다.
    //
    // 72시간이던 것을 120시간으로 늘린다. 엔티티가 458 → 1,168건으로 늘면서 72시간 주기의 필요
    // 처리량이 하루 390건이 됐는데, 분석 실행은 하루 8회(cron 47 */3)이고 실행당 상한이 50건이라
    // 능력은 하루 400건이다. 여유가 없어 백로그가 쌓였고 2026-09-15 실측으로 최근 72시간 안에
    // 분석된 공개 엔티티가 1,168건 중 503건(43%)뿐이었다. 120시간이면 필요 처리량이 하루 234건으로
    // 내려가 실제 여유가 생기고 밀린 분량도 소진된다.
    const staleThreshold = now.getTime() - REANALYSIS_INTERVAL_HOURS * 3_600_000;
    const latestAnalysisAt = await options.repository.loadLatestAnalysisAt(
      processed.map((group) => group.entity.id),
      TREND_ANALYSIS_PROMPT_VERSION,
    );
    // 우선순위: 미분석 review 후보(점수순) → 재분석 대상(가장 오래된 것부터). 보류(private)는 제외.
    const queue = selectPendingAnalyses(
      processed,
      limit,
      (group) => {
        if (group.entity.visibility === "private") return "excluded";
        const latest = latestAnalysisAt.get(group.entity.id);
        if (latest === undefined) return "unanalyzed";
        return latest < staleThreshold ? "stale" : "recent";
      },
      (group) => latestAnalysisAt.get(group.entity.id) ?? 0,
    );
    analysesSkipped = queue.skipped;
    analysisQueue.unanalyzed = queue.unanalyzed;
    analysisQueue.stale = queue.stale;
    analysisQueue.selected = queue.pending.length;
    analysisQueue.remaining = queue.remaining;
    // 마감이 없으면 무한대로 두어 기존 동작(한도에 걸릴 때까지 계속)을 유지한다.
    const deadlineMs = options.analysisDeadline?.getTime() ?? Number.POSITIVE_INFINITY;
    const remainingMs = () => deadlineMs - Date.now();

    let lastRequestAt = 0;
    for (const group of queue.pending) {
      // 마감을 넘겼으면 남은 후보는 다음 주기에 맡긴다. 여기서 멈춰야 자동 승인이 실행된다.
      if (remainingMs() <= 0) {
        analysisStoppedReason = "DEADLINE";
        stoppedEarly = true;
        break;
      }
      // 분당 한도 아래로 간격을 둔다(ANALYSIS_MIN_INTERVAL_MS 참고). 한도에 부딪힌 뒤 30~55초
      // 기다리는 것보다 미리 4.2초씩 띄우는 쪽이 같은 예산에서 더 많이 처리한다.
      const sinceLast = Date.now() - lastRequestAt;
      if (lastRequestAt > 0 && sinceLast < ANALYSIS_MIN_INTERVAL_MS) {
        const pause = ANALYSIS_MIN_INTERVAL_MS - sinceLast;
        // 마감을 넘겨가며 기다리지는 않는다.
        if (pause >= remainingMs()) {
          analysisStoppedReason = "DEADLINE";
          stoppedEarly = true;
          break;
        }
        await sleep(pause);
      }
      lastRequestAt = Date.now();
      // 분당 한도에 걸리면 서버가 알려준 만큼 기다렸다 같은 후보를 한 번 더 시도한다.
      // 마감까지 기다릴 여유가 없으면 이번 실행을 끝내고 다음 주기에 맡긴다.
      let attempted = false;
      let upstreamRetried = false;
      while (!attempted) {
        attempted = true;
        try {
          const result = await options.analysisProvider.analyze(toEvidence(group, now));
          await options.repository.saveAnalysis(group.entity.id, result);
          analysesCreated += 1;
          // 한국어 요약은 카테고리 분류에 좋은 신호라 분류 입력으로 쓴다.
          analyzedForCategory.push({ entityId: group.entity.id, name: group.entity.name, description: result.analysis.summary });
        } catch (error) {
          // 공급자가 "다시 하면 될 수도 있다"고 표시한 일시 오류(Gemini 503 high demand·요청 타임아웃)는
          // 같은 후보를 한 번 더 시도한다. 공급자는 retryable 플래그를 처음부터 붙여 왔는데 runner 가
          // RATE_LIMIT 만 보고 나머지를 버렸다 — 2026-10-03~04 분석 실행에서 50건 중 5~21건이 이렇게
          // 사라졌다(analysisErrors 로 삼켜져 실행은 success). 후보당 한 번만 재시도해, 모델이 계속
          // 과부하면 예산을 다 태우지 않고 다음 후보로 넘어간다.
          if (planUpstreamRetry({ error, alreadyRetried: upstreamRetried, remainingMs: remainingMs() })) {
            upstreamRetried = true;
            upstreamRetries += 1;
            await sleep(UPSTREAM_RETRY_DELAY_MS);
            attempted = false;
            continue;
          }
          analysisErrors.push({
            entity: group.entity.slug,
            error: error instanceof Error ? error.message : "Unknown analysis failure",
          });
          if (error instanceof LlmProviderError && (
            error.code === "RATE_LIMIT" || error.code === "AUTH" || error.code === "CONFIG"
          )) {
            if (error.code === "RATE_LIMIT") {
              lastRateLimitAt = new Date().toISOString();
              const plan = planRateLimitWait({ retryAfterMs: error.retryAfterMs, remainingMs: remainingMs() });
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
    // 분석 전용 실행에서 기존 엔티티에 매칭되지 않아 건너뛴 후보 수(생성은 수집 워크플로의 몫).
    candidatesUnmatched,
    // 배치로 저장한 별칭·언급·지표 행 수(중복 제거 후).
    candidateWrites,
    entitiesProcessed: processed.length,
    // 분석 전용 실행은 점수를 저장하지 않으므로 0으로 보고한다(계산은 정렬용으로만 썼다).
    scoresCreated: options.analysisOnly ? 0 : processed.length,
    analysesCreated,
    analysesSkipped,
    categoriesUpdated,
    analysisErrors,
    analysisStoppedReason,
    lastRateLimitAt,
    // 분당 한도에 걸려 기다린 누적 시간. 0보다 크면 즉시 중단 대신 기다려서 더 처리했다는 뜻이다.
    rateLimitWaitedMs,
    // 일시 오류(503 high demand·타임아웃)로 같은 후보를 다시 시도한 횟수.
    upstreamRetries,
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
