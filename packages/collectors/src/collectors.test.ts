import { describe, expect, it } from "vitest";
import { GitHubCollector } from "./github";
import { HackerNewsCollector } from "./hacker-news";
import { ProductHuntCollector } from "./product-hunt";
import { RedditCollector } from "./reddit";
import { toRawItemRows } from "./supabase-store";

const context = { now: new Date("2026-07-19T12:00:00Z"), mode: "fixture" as const };

describe("GitHubCollector", () => {
  it("validates and normalizes fixture repositories", async () => {
    const result = await new GitHubCollector().collect({}, context);
    expect(result.items).toHaveLength(2);
    expect(result.items[0]?.canonicalUrl).toBe("https://browser-use.com/");
    expect(result.items[0]?.metrics.stars).toBe(68420);
  });
});

describe("HackerNewsCollector", () => {
  it("maps HN hits to the common raw item contract", async () => {
    const result = await new HackerNewsCollector().collect({}, context);
    expect(result.source).toBe("hacker_news");
    expect(result.items[0]?.metrics.comments).toBe(94);
  });

  it("falls back to the HN item URL when the live API omits url", async () => {
    const fetcher = async () => new Response(JSON.stringify({
      hits: [{
        objectID: "44990001",
        title: "Show HN: An AI tool",
        author: "builder",
        created_at: "2026-07-20T00:00:00.000Z",
        points: 12,
        num_comments: 3,
      }],
    }), { status: 200, headers: { "content-type": "application/json" } });

    const result = await new HackerNewsCollector().collect(
      { fetcher },
      { ...context, mode: "live" },
    );

    expect(result.items[0]?.url).toBe("https://news.ycombinator.com/item?id=44990001");
  });
});

describe("ProductHuntCollector", () => {
  it("maps fixture posts to the common raw item contract", async () => {
    const result = await new ProductHuntCollector().collect({}, context);
    expect(result.source).toBe("product_hunt");
    expect(result.items).toHaveLength(3);
    const first = result.items[0];
    expect(first?.title).toBe("Agentflow");
    expect(first?.canonicalUrl).toBe("https://agentflow.ai/");
    expect(first?.metrics).toEqual({ votes: 842, comments: 96 });
    expect(first?.authorName).toBe("Dana Lee");
  });

  it("returns a blocked result with a warning when no token is set in live mode", async () => {
    const result = await new ProductHuntCollector().collect({}, { ...context, mode: "live" });
    expect(result.items).toHaveLength(0);
    expect(result.warnings[0]).toContain("PRODUCT_HUNT_TOKEN");
  });

  it("paginates via endCursor and captures rate-limit headers", async () => {
    const pages = [
      {
        data: {
          posts: {
            edges: [{
              node: {
                id: "1", name: "PageOne", tagline: "AI tool", description: null,
                slug: "pageone", url: "https://ph.co/posts/pageone", website: "https://pageone.ai",
                votesCount: 10, commentsCount: 1, createdAt: "2026-07-18T00:00:00Z",
                featuredAt: null, user: { name: "A" }, topics: { edges: [] },
              },
            }],
            pageInfo: { hasNextPage: true, endCursor: "cursor-1" },
          },
        },
      },
      {
        data: {
          posts: {
            edges: [{
              node: {
                id: "2", name: "PageTwo", tagline: "AI agent", description: null,
                slug: "pagetwo", url: "https://ph.co/posts/pagetwo", website: "https://pagetwo.ai",
                votesCount: 20, commentsCount: 2, createdAt: "2026-07-17T00:00:00Z",
                featuredAt: null, user: { name: "B" }, topics: { edges: [] },
              },
            }],
            pageInfo: { hasNextPage: false, endCursor: "cursor-2" },
          },
        },
      },
    ];
    const cursors: Array<string | null> = [];
    let call = 0;
    const fetcher = async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      cursors.push(body.variables.after ?? null);
      const page = pages[call];
      call += 1;
      return new Response(JSON.stringify(page), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "x-rate-limit-remaining": "6100",
          "x-rate-limit-reset": "600",
        },
      });
    };

    const result = await new ProductHuntCollector().collect(
      { token: "test-token", fetcher: fetcher as unknown as typeof fetch, maxPages: 5 },
      { ...context, mode: "live" },
    );

    expect(result.items.map((item) => item.title)).toEqual(["PageOne", "PageTwo"]);
    expect(cursors).toEqual([null, "cursor-1"]);
    expect(result.rateLimit?.remaining).toBe(6100);
    expect(result.rateLimit?.resetAt).toBe("2026-07-19T12:10:00.000Z");
  });

  it("uses the unique PH product page instead of the shared tracking redirect", async () => {
    // 추적 링크(producthunt.com/r/<code>)를 canonical로 쓰면 모든 제품 도메인이 producthunt.com이
    // 되어 파이프라인이 서로 다른 제품을 한 엔티티로 합쳐버린다. post.url은 제품마다 고유하다.
    const node = (id: string, name: string, code: string) => ({
      id, name, tagline: "AI agent", description: null, slug: name.toLowerCase(),
      url: `https://www.producthunt.com/products/${name.toLowerCase()}?utm_campaign=producthunt-api`,
      website: `https://producthunt.com/r/${code}`,
      votesCount: 10, commentsCount: 1, createdAt: "2026-07-18T00:00:00Z",
      featuredAt: null, user: { name: "A" }, topics: { edges: [] },
    });
    let headCalls = 0;
    const fetcher = async (_url: string | URL | Request, init?: RequestInit) => {
      if (init?.method === "HEAD") { headCalls += 1; return new Response(null, { status: 200 }); }
      return new Response(JSON.stringify({
        data: {
          posts: {
            edges: [{ node: node("1", "Clark", "AAA") }, { node: node("2", "Buzzy", "BBB") }],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      }), { status: 200, headers: { "content-type": "application/json" } });
    };

    const result = await new ProductHuntCollector().collect(
      { token: "test-token", fetcher: fetcher as unknown as typeof fetch },
      { ...context, mode: "live" },
    );

    // 기본값에서는 추적 링크를 따라가지 않는다(PH가 자동 요청을 차단하고 약관상 과도한 사용이다).
    expect(headCalls).toBe(0);
    expect(result.items.map((item) => item.canonicalUrl)).toEqual([
      "https://producthunt.com/products/clark",
      "https://producthunt.com/products/buzzy",
    ]);
  });

  it("prefers a direct website over the PH product page when PH gives one", async () => {
    const fetcher = async () => new Response(JSON.stringify({
      data: {
        posts: {
          edges: [{
            node: {
              id: "1", name: "Clark", tagline: "AI agent", description: null, slug: "clark",
              url: "https://www.producthunt.com/products/clark", website: "https://www.clarkchat.com/?ref=producthunt",
              votesCount: 10, commentsCount: 1, createdAt: "2026-07-18T00:00:00Z",
              featuredAt: null, user: { name: "A" }, topics: { edges: [] },
            },
          }],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      },
    }), { status: 200, headers: { "content-type": "application/json" } });

    const result = await new ProductHuntCollector().collect(
      { token: "test-token", fetcher: fetcher as unknown as typeof fetch },
      { ...context, mode: "live" },
    );
    expect(result.items[0]?.canonicalUrl).toBe("https://clarkchat.com/");
  });

  it("resolves the tracking redirect when explicitly enabled", async () => {
    // 실제 체인과 동일하게 www 정규화를 한 번 거친 뒤 제품 사이트로 넘어가게 둔다.
    const destinations: Record<string, string> = {
      "https://producthunt.com/r/AAA": "https://www.producthunt.com/r/AAA",
      "https://www.producthunt.com/r/AAA": "https://www.clarkchat.com/?ref=producthunt",
      "https://producthunt.com/r/BBB": "https://www.producthunt.com/r/BBB",
      "https://www.producthunt.com/r/BBB": "https://www.buzzy.now/?utm_source=product_hunt&ref=producthunt",
    };
    const node = (id: string, name: string, code: string) => ({
      id, name, tagline: "AI agent", description: null, slug: name.toLowerCase(),
      url: `https://ph.co/posts/${name.toLowerCase()}`, website: `https://producthunt.com/r/${code}`,
      votesCount: 10, commentsCount: 1, createdAt: "2026-07-18T00:00:00Z",
      featuredAt: null, user: { name: "A" }, topics: { edges: [] },
    });
    const headRequests: string[] = [];
    const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
      if (init?.method === "HEAD") {
        const target = String(url);
        headRequests.push(target);
        const location = destinations[target];
        return location
          ? new Response(null, { status: 302, headers: { location } })
          : new Response(null, { status: 200 });
      }
      return new Response(JSON.stringify({
        data: {
          posts: {
            edges: [{ node: node("1", "Clark", "AAA") }, { node: node("2", "Buzzy", "BBB") }],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      }), { status: 200, headers: { "content-type": "application/json" } });
    };

    const result = await new ProductHuntCollector().collect(
      { token: "test-token", fetcher: fetcher as unknown as typeof fetch, resolveRedirects: true },
      { ...context, mode: "live" },
    );

    // 제품당 2홉(www 정규화 → 제품 사이트)을 따라간다.
    expect(headRequests).toHaveLength(4);
    // canonicalizeUrl이 www.·ref·utm_*를 정리해 제품별 고유 도메인이 남는다.
    expect(result.items.map((item) => item.canonicalUrl)).toEqual([
      "https://clarkchat.com/",
      "https://buzzy.now/",
    ]);
  });

  it("falls back to the PH product page when redirect resolution fails", async () => {
    // PH가 403으로 막는 경우가 실제로 흔하다. 그때도 항목을 버리지 않고 고유한 제품 페이지를 쓴다.
    const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
      if (init?.method === "HEAD") throw new Error("network down");
      return new Response(JSON.stringify({
        data: {
          posts: {
            edges: [{
              node: {
                id: "1", name: "Clark", tagline: "AI agent", description: null, slug: "clark",
                url: "https://www.producthunt.com/products/clark", website: "https://producthunt.com/r/AAA",
                votesCount: 10, commentsCount: 1, createdAt: "2026-07-18T00:00:00Z",
                featuredAt: null, user: { name: "A" }, topics: { edges: [] },
              },
            }],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      }), { status: 200, headers: { "content-type": "application/json" } });
    };

    const result = await new ProductHuntCollector().collect(
      { token: "test-token", fetcher: fetcher as unknown as typeof fetch, resolveRedirects: true },
      { ...context, mode: "live" },
    );
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.canonicalUrl).toBe("https://producthunt.com/products/clark");
  });

  it("throws on GraphQL errors so the run is recorded as failed", async () => {
    const fetcher = async () => new Response(
      JSON.stringify({ errors: [{ message: "invalid token" }] }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
    await expect(
      new ProductHuntCollector().collect(
        { token: "bad", fetcher: fetcher as unknown as typeof fetch },
        { ...context, mode: "live" },
      ),
    ).rejects.toThrow(/GraphQL error/);
  });
});

describe("RedditCollector", () => {
  it("maps fixture listing to the common raw item contract", async () => {
    const result = await new RedditCollector().collect({}, context);
    expect(result.source).toBe("reddit");
    expect(result.items).toHaveLength(3);
    const first = result.items[0];
    expect(first?.title).toContain("Rundeck AI");
    expect(first?.canonicalUrl).toBe("https://rundeck-ai.dev/");
    expect(first?.metrics).toEqual({ score: 412, comments: 87 });
    expect(first?.publishedAt).toBe("2025-07-22T06:00:00.000Z");
  });

  it("returns a blocked result with a warning when credentials are missing in live mode", async () => {
    const result = await new RedditCollector().collect({}, { ...context, mode: "live" });
    expect(result.items).toHaveLength(0);
    expect(result.warnings[0]).toContain("REDDIT_CLIENT_ID");
  });

  it("authenticates, paginates via after, and captures rate-limit headers", async () => {
    const listing = (after: string | null, id: string) => ({
      kind: "Listing",
      data: {
        after,
        children: [{
          kind: "t3",
          data: {
            id, name: `t3_${id}`, title: `AI tool ${id}`, selftext: "", url: `https://${id}.ai`,
            permalink: `/r/x/${id}`, author: "u", created_utc: 1753164000, score: 5,
            num_comments: 1, subreddit: "x", is_self: false,
          },
        }],
      },
    });
    const calls: string[] = [];
    let apiCall = 0;
    const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
      const href = String(url);
      if (href.includes("access_token")) {
        expect(init?.headers).toMatchObject({ Authorization: expect.stringContaining("Basic ") });
        return new Response(
          JSON.stringify({ access_token: "tok-123", token_type: "bearer", expires_in: 3600 }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      calls.push(href);
      const page = apiCall === 0 ? listing("t3_p1", "p1") : listing(null, "p2");
      apiCall += 1;
      return new Response(JSON.stringify(page), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "x-ratelimit-remaining": "95",
          "x-ratelimit-reset": "300",
        },
      });
    };

    const result = await new RedditCollector().collect(
      { clientId: "id", clientSecret: "secret", fetcher: fetcher as unknown as typeof fetch, maxPages: 5 },
      { ...context, mode: "live" },
    );

    expect(result.items.map((item) => item.title)).toEqual(["AI tool p1", "AI tool p2"]);
    expect(calls[1]).toContain("after=t3_p1");
    expect(result.rateLimit?.remaining).toBe(95);
  });
});

describe("Supabase raw item mapping", () => {
  it("maps the common raw item contract to idempotent database rows", async () => {
    const result = await new GitHubCollector().collect({}, context);
    const rows = toRawItemRows("ca415a11-a2c0-4b91-a457-f24dd2fc0ad5", result.items);

    expect(rows[0]).toMatchObject({
      source_item_id: "101",
      title: "browser-use/browser-use",
      raw_metrics_json: { stars: 68420, forks: 7420, issues: 188 },
    });
    expect(rows[0]?.raw_payload_json).toBeTruthy();
  });

  it("collapses duplicate sourceItemId within a batch, keeping the last", () => {
    // Product Hunt 가 같은 node.id 를 한 응답에 두 번 실어 보내면 Postgres upsert 가 배치째 실패했다.
    const base = {
      title: "Dup", body: null, url: "https://example.com/", canonicalUrl: "https://example.com/",
      authorName: null, publishedAt: "2026-08-11T00:00:00Z", rawPayload: {}, collectedAt: "2026-08-11T00:00:00Z",
      source: "product_hunt" as const,
    };
    const rows = toRawItemRows("11111111-1111-4111-8111-111111111111", [
      { ...base, sourceItemId: "A", metrics: { votes: 10 } },
      { ...base, sourceItemId: "B", metrics: { votes: 20 } },
      { ...base, sourceItemId: "A", metrics: { votes: 99 } },
    ]);

    expect(rows).toHaveLength(2);
    const a = rows.find((r) => r.source_item_id === "A");
    // 뒤에 온 항목이 더 최신 지표라 마지막 것을 남긴다.
    expect(a?.raw_metrics_json).toEqual({ votes: 99 });
  });
});
