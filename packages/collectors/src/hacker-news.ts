import type {
  Collector,
  CollectorContext,
  CollectorResult,
  RawItem,
} from "@ai-trend-radar/types";
import { canonicalizeUrl } from "@ai-trend-radar/scoring";
import { z } from "zod";
import fixture from "../fixtures/hacker-news-search.json" with { type: "json" };
import { withRetry } from "./retry";

const hnHitSchema = z.object({
  objectID: z.string(),
  title: z.string().nullable(),
  url: z.string().nullable().optional(),
  author: z.string(),
  created_at: z.iso.datetime(),
  points: z.number().nullable(),
  num_comments: z.number().nullable(),
  story_text: z.string().nullable().optional(),
});

const hnSearchSchema = z.object({ hits: z.array(hnHitSchema) });
export type HackerNewsPayload = z.infer<typeof hnHitSchema>;

export interface HackerNewsCollectorConfig {
  query?: string;
  hitsPerPage?: number;
  fetcher?: typeof fetch;
}

export class HackerNewsCollector
  implements Collector<HackerNewsCollectorConfig, HackerNewsPayload>
{
  readonly source = "hacker_news" as const;

  async collect(
    config: HackerNewsCollectorConfig,
    context: CollectorContext,
  ): Promise<CollectorResult<HackerNewsPayload>> {
    const startedAt = context.now.toISOString();
    const payload = context.mode === "fixture" ? hnSearchSchema.parse(fixture) : await this.fetchLive(config, context);
    const collectedAt = context.now.toISOString();
    const items = payload.hits
      .filter((hit) => hit.title)
      .map<RawItem<HackerNewsPayload>>((hit) => {
        const url = hit.url ?? `https://news.ycombinator.com/item?id=${hit.objectID}`;
        return {
          source: "hacker_news",
          sourceItemId: hit.objectID,
          title: hit.title ?? "Untitled Hacker News item",
          body: hit.story_text ?? null,
          url,
          canonicalUrl: canonicalizeUrl(url),
          authorName: hit.author,
          publishedAt: hit.created_at,
          collectedAt,
          metrics: { points: hit.points ?? 0, comments: hit.num_comments ?? 0 },
          rawPayload: hit,
        };
      });
    return {
      source: this.source,
      startedAt,
      finishedAt: new Date(context.now.getTime() + 1).toISOString(),
      items,
      warnings: context.mode === "fixture" ? ["Fixture mode: Algolia HN data was not fetched live."] : [],
    };
  }

  private async fetchLive(config: HackerNewsCollectorConfig, context: CollectorContext) {
    const fetcher = config.fetcher ?? fetch;
    const url = new URL("https://hn.algolia.com/api/v1/search_by_date");
    url.searchParams.set("query", config.query ?? "AI agent");
    url.searchParams.set("tags", "story");
    url.searchParams.set("hitsPerPage", String(config.hitsPerPage ?? 50));
    return withRetry(async () => {
      const response = await fetcher(url, context.signal ? { signal: context.signal } : {});
      if (!response.ok) throw new Error(`Hacker News collector failed with HTTP ${response.status}`);
      return hnSearchSchema.parse(await response.json());
    }, context.signal ? { signal: context.signal } : {});
  }
}
