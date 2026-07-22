import type {
  Collector,
  CollectorContext,
  CollectorResult,
  RawItem,
} from "@ai-trend-radar/types";
import { canonicalizeUrl } from "@ai-trend-radar/scoring";
import { z } from "zod";
import fixture from "../fixtures/product-hunt-posts.json" with { type: "json" };
import { withRetry } from "./retry";

const PRODUCT_HUNT_ENDPOINT = "https://api.producthunt.com/v2/api/graphql";

const productHuntNodeSchema = z.object({
  id: z.string(),
  name: z.string(),
  tagline: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  slug: z.string(),
  url: z.string(),
  website: z.string().nullable().optional(),
  votesCount: z.number().nonnegative(),
  commentsCount: z.number().nonnegative(),
  createdAt: z.iso.datetime({ offset: true }),
  featuredAt: z.iso.datetime({ offset: true }).nullable().optional(),
  user: z.object({ name: z.string().nullable() }).nullable().optional(),
  topics: z
    .object({ edges: z.array(z.object({ node: z.object({ name: z.string() }) })) })
    .optional(),
});

const productHuntPageSchema = z.object({
  edges: z.array(z.object({ node: productHuntNodeSchema })),
  pageInfo: z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullable() }),
});

const productHuntResponseSchema = z.object({
  data: z.object({ posts: productHuntPageSchema }).nullable().optional(),
  errors: z
    .array(z.object({ message: z.string() }))
    .optional(),
});

export type ProductHuntPayload = z.infer<typeof productHuntNodeSchema>;

export interface ProductHuntCollectorConfig {
  /** Product Hunt developer/OAuth access token. 없으면 라이브 수집을 건너뛴다(blocked). */
  token?: string;
  /** 페이지당 게시물 수 (기본 20). */
  first?: number;
  /** 최대 페이지 수 (기본 3). 복잡도 한도(15분당 6250) 보호. */
  maxPages?: number;
  /** 최근 N일 이내 게시물만 조회 (기본 7). */
  postedAfterDays?: number;
  fetcher?: typeof fetch;
  endpoint?: string;
}

const POSTS_QUERY = `
query TrendPosts($first: Int!, $after: String, $postedAfter: DateTime, $order: PostsOrder!) {
  posts(first: $first, after: $after, postedAfter: $postedAfter, order: $order) {
    edges {
      node {
        id
        name
        tagline
        description
        slug
        url
        website
        votesCount
        commentsCount
        createdAt
        featuredAt
        user { name }
        topics(first: 5) { edges { node { name } } }
      }
    }
    pageInfo { hasNextPage endCursor }
  }
}`;

export class ProductHuntCollector
  implements Collector<ProductHuntCollectorConfig, ProductHuntPayload>
{
  readonly source = "product_hunt" as const;

  async collect(
    config: ProductHuntCollectorConfig,
    context: CollectorContext,
  ): Promise<CollectorResult<ProductHuntPayload>> {
    const startedAt = context.now.toISOString();
    const collectedAt = context.now.toISOString();

    // 라이브 모드인데 토큰이 없으면 실패가 아니라 blocked(부분 성공)로 표시한다.
    if (context.mode === "live" && !config.token) {
      return {
        source: this.source,
        startedAt,
        finishedAt: new Date(context.now.getTime() + 1).toISOString(),
        items: [],
        warnings: [
          "Product Hunt 액세스 토큰(PRODUCT_HUNT_TOKEN)이 없어 라이브 수집을 건너뜁니다.",
        ],
      };
    }

    const live = context.mode === "fixture" ? null : await this.fetchLive(config, context);
    const nodes = live?.nodes ?? productHuntResponseSchema.parse(fixture).data!.posts.edges.map((edge) => edge.node);

    const items = nodes.map<RawItem<ProductHuntPayload>>((node) => {
      const targetUrl = node.website?.trim() || node.url;
      return {
        source: "product_hunt",
        sourceItemId: node.id,
        title: node.name,
        body: node.description?.trim() || node.tagline?.trim() || null,
        url: targetUrl,
        canonicalUrl: canonicalizeUrl(targetUrl),
        authorName: node.user?.name ?? null,
        publishedAt: node.createdAt,
        collectedAt,
        metrics: { votes: node.votesCount, comments: node.commentsCount },
        rawPayload: node,
      };
    });

    return {
      source: this.source,
      startedAt,
      finishedAt: new Date(context.now.getTime() + 1).toISOString(),
      items,
      warnings: context.mode === "fixture"
        ? ["Fixture mode: Product Hunt 데이터를 라이브로 가져오지 않았습니다."]
        : [],
      ...(live?.rateLimit ? { rateLimit: live.rateLimit } : {}),
    };
  }

  private async fetchLive(config: ProductHuntCollectorConfig, context: CollectorContext) {
    const fetcher = config.fetcher ?? fetch;
    const endpoint = config.endpoint ?? PRODUCT_HUNT_ENDPOINT;
    const first = Math.min(50, Math.max(1, config.first ?? 20));
    const maxPages = Math.min(10, Math.max(1, config.maxPages ?? 3));
    const postedAfterDays = Math.max(1, config.postedAfterDays ?? 7);
    const postedAfter = new Date(context.now.getTime() - postedAfterDays * 24 * 3_600_000).toISOString();

    const nodes: ProductHuntPayload[] = [];
    let after: string | null = null;
    let rateLimit: CollectorResult["rateLimit"];

    for (let page = 0; page < maxPages; page += 1) {
      const variables: Record<string, unknown> = { first, order: "VOTES", postedAfter };
      if (after) variables.after = after;

      const pageResult = await withRetry(async () => {
        const response = await fetcher(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `Bearer ${config.token}`,
          },
          body: JSON.stringify({ query: POSTS_QUERY, variables }),
          ...(context.signal ? { signal: context.signal } : {}),
        });
        if (!response.ok) {
          throw new Error(`Product Hunt collector failed with HTTP ${response.status}`);
        }
        const parsed = productHuntResponseSchema.parse(await response.json());
        if (parsed.errors?.length) {
          throw new Error(`Product Hunt GraphQL error: ${parsed.errors.map((e) => e.message).join("; ")}`);
        }
        if (!parsed.data) throw new Error("Product Hunt 응답에 data가 없습니다.");
        return { page: parsed.data.posts, headers: response.headers };
      }, context.signal ? { signal: context.signal } : {});

      for (const edge of pageResult.page.edges) nodes.push(edge.node);
      rateLimit = readRateLimit(pageResult.headers, context.now.getTime());

      if (!pageResult.page.pageInfo.hasNextPage || !pageResult.page.pageInfo.endCursor) break;
      after = pageResult.page.pageInfo.endCursor;
    }

    return { nodes, ...(rateLimit ? { rateLimit } : {}) };
  }
}

function readRateLimit(headers: Headers, nowMs: number): CollectorResult["rateLimit"] {
  const remaining = Number(headers.get("x-rate-limit-remaining"));
  const resetSeconds = Number(headers.get("x-rate-limit-reset"));
  return {
    remaining: Number.isFinite(remaining) ? remaining : null,
    resetAt: Number.isFinite(resetSeconds)
      ? new Date(nowMs + resetSeconds * 1_000).toISOString()
      : null,
  };
}
