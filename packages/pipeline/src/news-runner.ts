import { fetchNewsFromFeeds, type RawNewsItem, withRetry } from "@ai-trend-radar/collectors";
import { type GeminiNewsSummarizer, LlmProviderError } from "@ai-trend-radar/llm";
import type { NewsInsertRow, NewsRepository } from "./news-repository";

export interface RunNewsOptions {
  summarizer: GeminiNewsSummarizer;
  repository?: NewsRepository;
  now?: Date;
  limit?: number;
  dryRun?: boolean;
  signal?: AbortSignal;
}

export interface RunNewsResult {
  fetched: number;
  fresh: number;
  inserted: number;
  warnings: string[];
  preview?: { source: string; koTitle: string; koSummary: string }[];
}

export async function runNewsPipeline(options: RunNewsOptions): Promise<RunNewsResult> {
  const { summarizer, repository, now = new Date(), limit = 30, dryRun = false, signal } = options;

  const { items, warnings } = await fetchNewsFromFeeds({ now, ...(signal ? { signal } : {}) });
  const fetched = items.length;

  const candidates = items.slice(0, Math.max(limit * 2, limit));
  let fresh: RawNewsItem[] = candidates;
  if (!dryRun) {
    if (!repository) throw new Error("repository가 필요합니다.");
    const existing = await repository.loadExistingCanonicalUrls(candidates.map((item) => item.canonicalUrl));
    fresh = candidates.filter((item) => !existing.has(item.canonicalUrl));
  }
  fresh = fresh.slice(0, limit);

  if (fresh.length === 0) return { fetched, fresh: 0, inserted: 0, warnings };

  // 요약은 최대 30건을 한 번의 Gemini 호출로 처리해 응답이 느릴 때 타임아웃에 걸린다. 이 오류는
  // retryable 로 표시되는데도 재시도하는 곳이 없어, 한 번 늦으면 수집한 뉴스를 통째로 버리고
  // 워크플로가 실패했다(실측 2026-08-13: 40회 중 1회, 45초 한도에서 48초 만에 중단).
  // 일시적 지연은 재시도로 넘기고, 끝까지 실패하면 경고로 남겨 다음 주기에 맡긴다 —
  // 아직 저장하지 않은 항목이라 다음 실행에서 같은 뉴스를 다시 가져온다.
  let summaries;
  try {
    summaries = await withRetry(
      () => summarizer.summarize(
        fresh.map((item, index) => ({ index, source: item.source, title: item.title, snippet: item.snippet })),
        signal ? { signal } : undefined,
      ),
      {
        attempts: 3,
        baseDelayMs: 2_000,
        ...(signal ? { signal } : {}),
        // 설정 오류나 인증 실패는 다시 시도해도 같은 결과라 즉시 포기한다.
        shouldRetry: (error) => !(error instanceof LlmProviderError) || error.retryable,
      },
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : "알 수 없는 오류";
    return {
      fetched,
      fresh: fresh.length,
      inserted: 0,
      warnings: [...warnings, `뉴스 한국어 요약에 실패해 이번 주기는 저장을 건너뜁니다: ${reason}`],
    };
  }
  const byIndex = new Map(summaries.map((summary) => [summary.index, summary]));

  const rows: NewsInsertRow[] = [];
  fresh.forEach((item, index) => {
    const summary = byIndex.get(index);
    if (!summary) return;
    rows.push({
      source: item.source,
      url: item.url,
      canonicalUrl: item.canonicalUrl,
      originalTitle: item.title,
      koTitle: summary.koTitle,
      koSummary: summary.koSummary,
      publishedAt: item.publishedAt,
    });
  });

  let inserted = 0;
  if (!dryRun && repository) inserted = await repository.insertNews(rows);

  return {
    fetched,
    fresh: fresh.length,
    inserted,
    warnings,
    ...(dryRun ? { preview: rows.slice(0, 8).map((r) => ({ source: r.source, koTitle: r.koTitle, koSummary: r.koSummary })) } : {}),
  };
}
