import {
  TREND_ANALYSIS_PROMPT_VERSION,
  type TrendAnalysisProvider,
  type TrendEvidence,
} from "@ai-trend-radar/llm";
import { selectPendingAnalyses } from "./analysis-queue";
import { extractEntityCandidate } from "./candidate";
import { calculateInitialTrendScore } from "./initial-score";
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

function toEvidence(group: ProcessedGroup, now: Date): TrendEvidence {
  const officialFacts = [...new Set(group.candidates.flatMap((candidate) => candidate.officialFacts))];
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
  const analysisErrors: Array<{ entity: string; error: string }> = [];
  if (options.analysisProvider) {
    const limit = Math.max(0, options.analysisLimit ?? 3);
    const since = new Date(now.getTime() - 24 * 3_600_000).toISOString();
    const queue = await selectPendingAnalyses(
      processed,
      limit,
      (group) => options.repository.hasRecentAnalysis(
        group.entity.id,
        options.analysisProvider!.model,
        TREND_ANALYSIS_PROMPT_VERSION,
        since,
      ),
    );
    analysesSkipped = queue.skipped;
    for (const group of queue.pending) {
      try {
        const result = await options.analysisProvider.analyze(toEvidence(group, now));
        await options.repository.saveAnalysis(group.entity.id, result);
        analysesCreated += 1;
      } catch (error) {
        analysisErrors.push({
          entity: group.entity.slug,
          error: error instanceof Error ? error.message : "Unknown analysis failure",
        });
      }
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
    analysisErrors,
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
