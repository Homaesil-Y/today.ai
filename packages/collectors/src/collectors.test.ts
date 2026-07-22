import { describe, expect, it } from "vitest";
import { GitHubCollector } from "./github";
import { HackerNewsCollector } from "./hacker-news";
import { ProductHuntCollector } from "./product-hunt";
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
});
