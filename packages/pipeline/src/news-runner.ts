import { fetchNewsFromFeeds, type RawNewsItem } from "@ai-trend-radar/collectors";
import type { GeminiNewsSummarizer } from "@ai-trend-radar/llm";
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

  const summaries = await summarizer.summarize(
    fresh.map((item, index) => ({ index, source: item.source, title: item.title, snippet: item.snippet })),
    signal ? { signal } : undefined,
  );
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
