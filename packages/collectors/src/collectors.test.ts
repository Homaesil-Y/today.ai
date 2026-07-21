import { describe, expect, it } from "vitest";
import { GitHubCollector } from "./github";
import { HackerNewsCollector } from "./hacker-news";
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
