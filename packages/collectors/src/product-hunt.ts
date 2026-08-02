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
  /**
   * producthunt.com/r/<code> 추적 리다이렉트를 따라가 제품의 실제 홈페이지를 알아낸다(기본 false).
   *
   * 기본을 끈 이유: Product Hunt는 /r/ 링크에 대한 자동 HEAD 요청을 클라이언트 지문으로 차단해
   * (같은 User-Agent라도 curl은 301, Node fetch는 403) 성공률이 일정하지 않고, 수집 건마다 요청을
   * 보내면 약관상 과도한 사용에 해당한다. 해석하지 않아도 제품 구분은 되는데, canonicalUrl로
   * 추적 링크가 아니라 고유한 PH 제품 페이지(post.url)를 쓰기 때문이다.
   */
  resolveRedirects?: boolean;
  /** 리다이렉트 해석 동시 실행 수 (기본 6). */
  resolveConcurrency?: number;
}

const PRODUCT_HUNT_HOSTS = new Set(["producthunt.com", "www.producthunt.com", "ph.co"]);

function isProductHuntHost(url: string) {
  try {
    return PRODUCT_HUNT_HOSTS.has(new URL(url).hostname.toLowerCase());
  } catch {
    return false;
  }
}

const MAX_REDIRECT_HOPS = 5;

/**
 * 리다이렉트 체인을 따라가 실제 제품 홈페이지 URL을 돌려준다.
 * producthunt.com/r/<code>는 먼저 www.producthunt.com으로 한 번 정규화된 뒤 제품 사이트로 넘어가므로
 * 한 홉만 읽어서는 안 된다. Location을 직접 따라가되(redirect: "manual") 응답이 최종 URL을 알려주면
 * 그것도 활용한다. 해석에 실패하거나 끝까지 Product Hunt에 머물면 입력 URL을 그대로 반환해
 * 수집이 깨지지 않게 한다(도메인이 producthunt.com으로 남을 뿐이다).
 */
async function resolveFinalUrl(url: string, fetcher: typeof fetch, signal?: AbortSignal) {
  let current = url;
  try {
    for (let hop = 0; hop < MAX_REDIRECT_HOPS; hop += 1) {
      // 본문이 필요 없으므로 HEAD를 쓴다.
      const response = await fetcher(current, { method: "HEAD", redirect: "manual", ...(signal ? { signal } : {}) });
      const location = response.headers.get("location");
      if (location) {
        current = new URL(location, current).toString();
        if (!isProductHuntHost(current)) return current;
        continue;
      }
      // redirect를 알아서 따라간 클라이언트는 Location 없이 최종 URL만 준다.
      if (response.url && response.url !== current && !isProductHuntHost(response.url)) return response.url;
      break;
    }
  } catch {
    return url;
  }
  return isProductHuntHost(current) ? url : current;
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T, index: number) => Promise<R>) {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(Math.max(1, limit), items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index]!, index);
    }
  });
  await Promise.all(runners);
  return results;
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

    // Product Hunt는 website조차 producthunt.com/r/<code> 추적 리다이렉트로 내려준다. 그 링크를 그대로
    // 쓰면 모든 제품의 도메인이 producthunt.com이 되고, 파이프라인이 "도메인이 같으면 같은 제품"으로
    // 판단해 전부 한 엔티티로 합쳐버린다(실제로 131건이 1건으로 합쳐졌다).
    // 그래서 추적 링크 대신 제품마다 고유한 PH 제품 페이지(post.url)를 canonical로 쓴다.
    // website가 PH 호스트가 아니면(직접 URL을 준 경우) 그건 실제 홈페이지이므로 우선한다.
    const shouldResolve = context.mode !== "fixture" && config.resolveRedirects === true;
    const fetcher = config.fetcher ?? fetch;
    const targetUrls = nodes.map((node) => {
      const website = node.website?.trim();
      return website && !isProductHuntHost(website) ? website : node.url;
    });
    const resolvedUrls = shouldResolve
      ? await mapWithConcurrency(
          nodes.map((node) => node.website?.trim() || node.url),
          config.resolveConcurrency ?? 4,
          (url, index) =>
            isProductHuntHost(url)
              ? resolveFinalUrl(url, fetcher, context.signal ?? undefined).then((resolved) =>
                  isProductHuntHost(resolved) ? targetUrls[index]! : resolved,
                )
              : Promise.resolve(url),
        )
      : targetUrls;

    const items = nodes.map<RawItem<ProductHuntPayload>>((node, index) => {
      const targetUrl = resolvedUrls[index] ?? targetUrls[index]!;
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
