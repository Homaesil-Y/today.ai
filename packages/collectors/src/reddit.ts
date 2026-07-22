import type {
  Collector,
  CollectorContext,
  CollectorResult,
  RawItem,
} from "@ai-trend-radar/types";
import { canonicalizeUrl } from "@ai-trend-radar/scoring";
import { z } from "zod";
import fixture from "../fixtures/reddit-search.json" with { type: "json" };
import { withRetry } from "./retry";

const REDDIT_AUTH_ENDPOINT = "https://www.reddit.com/api/v1/access_token";
const REDDIT_API_BASE = "https://oauth.reddit.com";
const DEFAULT_USER_AGENT = "today-ai-trend-radar/1.0 (+https://oh-ai-news.vercel.app)";

const redditPostSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  title: z.string(),
  selftext: z.string().nullable().optional(),
  url: z.string(),
  permalink: z.string().optional(),
  author: z.string().nullable().optional(),
  created_utc: z.number(),
  score: z.number(),
  num_comments: z.number().nonnegative(),
  subreddit: z.string().optional(),
  is_self: z.boolean().optional(),
});

const redditListingSchema = z.object({
  kind: z.literal("Listing"),
  data: z.object({
    after: z.string().nullable(),
    children: z.array(z.object({ kind: z.string(), data: redditPostSchema })),
  }),
});

const redditTokenSchema = z.object({
  access_token: z.string(),
  token_type: z.string(),
  expires_in: z.number(),
});

export type RedditPayload = z.infer<typeof redditPostSchema>;

export interface RedditCollectorConfig {
  /** Reddit OAuth app client id/secret. 둘 중 하나라도 없으면 라이브 수집을 blocked 처리. */
  clientId?: string;
  clientSecret?: string;
  /** Reddit이 요구하는 식별 가능한 User-Agent. */
  userAgent?: string;
  /** 검색어 (기본 "AI agent"). */
  query?: string;
  /** 특정 subreddit으로 제한할 때 사용. */
  subreddit?: string;
  /** 페이지당 게시물 수 (최대 100, 기본 50). */
  limit?: number;
  /** 최대 페이지 수 (기본 2). 100 QPM 보호. */
  maxPages?: number;
  fetcher?: typeof fetch;
  authEndpoint?: string;
  apiBaseUrl?: string;
}

export class RedditCollector
  implements Collector<RedditCollectorConfig, RedditPayload>
{
  readonly source = "reddit" as const;

  async collect(
    config: RedditCollectorConfig,
    context: CollectorContext,
  ): Promise<CollectorResult<RedditPayload>> {
    const startedAt = context.now.toISOString();
    const collectedAt = context.now.toISOString();

    if (context.mode === "live" && (!config.clientId || !config.clientSecret)) {
      return {
        source: this.source,
        startedAt,
        finishedAt: new Date(context.now.getTime() + 1).toISOString(),
        items: [],
        warnings: [
          "Reddit OAuth 자격증명(REDDIT_CLIENT_ID/REDDIT_CLIENT_SECRET)이 없어 라이브 수집을 건너뜁니다.",
        ],
      };
    }

    const live = context.mode === "fixture" ? null : await this.fetchLive(config, context);
    const posts = live?.posts
      ?? redditListingSchema.parse(fixture).data.children.map((child) => child.data);

    const items = posts.map<RawItem<RedditPayload>>((post) => ({
      source: "reddit",
      sourceItemId: post.id,
      title: post.title,
      body: post.selftext?.trim() || null,
      url: post.url,
      canonicalUrl: canonicalizeUrl(post.url),
      authorName: post.author ?? null,
      publishedAt: new Date(post.created_utc * 1_000).toISOString(),
      collectedAt,
      metrics: { score: post.score, comments: post.num_comments },
      rawPayload: post,
    }));

    return {
      source: this.source,
      startedAt,
      finishedAt: new Date(context.now.getTime() + 1).toISOString(),
      items,
      warnings: context.mode === "fixture"
        ? ["Fixture mode: Reddit 데이터를 라이브로 가져오지 않았습니다."]
        : [],
      ...(live?.rateLimit ? { rateLimit: live.rateLimit } : {}),
    };
  }

  private async fetchLive(config: RedditCollectorConfig, context: CollectorContext) {
    const fetcher = config.fetcher ?? fetch;
    const userAgent = config.userAgent ?? DEFAULT_USER_AGENT;
    const apiBase = config.apiBaseUrl ?? REDDIT_API_BASE;
    const limit = Math.min(100, Math.max(1, config.limit ?? 50));
    const maxPages = Math.min(10, Math.max(1, config.maxPages ?? 2));

    const token = await this.fetchToken(config, context, userAgent);

    const posts: RedditPayload[] = [];
    let after: string | null = null;
    let rateLimit: CollectorResult["rateLimit"];

    for (let page = 0; page < maxPages; page += 1) {
      const url = config.subreddit
        ? new URL(`${apiBase}/r/${encodeURIComponent(config.subreddit)}/search`)
        : new URL(`${apiBase}/search`);
      url.searchParams.set("q", config.query ?? "AI agent");
      url.searchParams.set("sort", "hot");
      url.searchParams.set("type", "link");
      url.searchParams.set("limit", String(limit));
      url.searchParams.set("raw_json", "1");
      if (config.subreddit) url.searchParams.set("restrict_sr", "true");
      if (after) url.searchParams.set("after", after);

      const pageResult = await withRetry(async () => {
        const response = await fetcher(url, {
          headers: { Authorization: `Bearer ${token}`, "User-Agent": userAgent },
          ...(context.signal ? { signal: context.signal } : {}),
        });
        if (!response.ok) throw new Error(`Reddit collector failed with HTTP ${response.status}`);
        return { listing: redditListingSchema.parse(await response.json()), headers: response.headers };
      }, context.signal ? { signal: context.signal } : {});

      for (const child of pageResult.listing.data.children) posts.push(child.data);
      rateLimit = readRateLimit(pageResult.headers, context.now.getTime());

      after = pageResult.listing.data.after;
      if (!after) break;
    }

    return { posts, ...(rateLimit ? { rateLimit } : {}) };
  }

  private async fetchToken(config: RedditCollectorConfig, context: CollectorContext, userAgent: string) {
    const fetcher = config.fetcher ?? fetch;
    const endpoint = config.authEndpoint ?? REDDIT_AUTH_ENDPOINT;
    const basic = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
    return withRetry(async () => {
      const response = await fetcher(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Basic ${basic}`,
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": userAgent,
        },
        body: "grant_type=client_credentials",
        ...(context.signal ? { signal: context.signal } : {}),
      });
      if (!response.ok) throw new Error(`Reddit auth failed with HTTP ${response.status}`);
      return redditTokenSchema.parse(await response.json()).access_token;
    }, context.signal ? { signal: context.signal } : {});
  }
}

function readRateLimit(headers: Headers, nowMs: number): CollectorResult["rateLimit"] {
  const remaining = Number(headers.get("x-ratelimit-remaining"));
  const resetSeconds = Number(headers.get("x-ratelimit-reset"));
  return {
    remaining: Number.isFinite(remaining) ? remaining : null,
    resetAt: Number.isFinite(resetSeconds)
      ? new Date(nowMs + resetSeconds * 1_000).toISOString()
      : null,
  };
}
