import { describe, expect, it } from "vitest";
import { extractEntityCandidate, slugifyName } from "./candidate";
import { calculateInitialTrendScore } from "./initial-score";
import type { DatabaseRawItem } from "./schema";

const githubItem: DatabaseRawItem = {
  id: "304ee086-ed52-4f02-8999-d117a8072168",
  source_id: "4eac34b0-8425-41a4-a3f7-38cb50d5019a",
  source_item_id: "101",
  source: "github",
  title: "acme/browser-agent",
  body: "An AI browser automation agent",
  url: "https://github.com/acme/browser-agent",
  canonical_url: "https://browser-agent.example",
  author_name: "acme",
  published_at: "2026-07-18T00:00:00.000Z",
  collected_at: "2026-07-20T00:00:00.000Z",
  raw_metrics_json: { stars: 1500, forks: 120, issues: 4 },
  raw_payload_json: {
    full_name: "acme/browser-agent",
    html_url: "https://github.com/acme/browser-agent",
    description: "An AI browser automation agent",
    created_at: "2026-07-18T00:00:00.000Z",
    updated_at: "2026-07-20T00:00:00.000Z",
    stargazers_count: 1500,
    forks_count: 120,
    open_issues_count: 4,
    language: "TypeScript",
    topics: ["ai", "agent"],
    homepage: "https://browser-agent.example",
    license: { spdx_id: "MIT" },
  },
};

describe("candidate extraction", () => {
  it("extracts a product-like GitHub repository", () => {
    const candidate = extractEntityCandidate(githubItem);
    expect(candidate).toMatchObject({
      name: "Browser Agent",
      canonicalUrl: "https://browser-agent.example/",
      categorySlug: "ai-agents",
      pricingType: "open_source",
    });
  });

  it("rejects curated list repositories", () => {
    const candidate = extractEntityCandidate({
      ...githubItem,
      title: "acme/awesome-ai-tools",
      raw_payload_json: {
        ...(githubItem.raw_payload_json as Record<string, unknown>),
        full_name: "acme/awesome-ai-tools",
        description: "An awesome curated list of AI tools",
      },
    });
    expect(candidate).toBeNull();
  });

  it("rejects educational and paper implementation repositories", () => {
    for (const description of [
      "A complete AI compendium for certified practitioners",
      "Build an LLM from scratch step by step",
      "[ECCV 2026] A paper implementation for video super-resolution",
    ]) {
      expect(extractEntityCandidate({
        ...githubItem,
        raw_payload_json: {
          ...(githubItem.raw_payload_json as Record<string, unknown>),
          description,
        },
      })).toBeNull();
    }
  });

  it("rejects editorial HN links and accepts Show HN product links", () => {
    const base = {
      ...githubItem,
      source: "hacker_news" as const,
      raw_payload_json: {},
      raw_metrics_json: { points: 12, comments: 3 },
    };
    expect(extractEntityCandidate({
      ...base,
      title: "The AI agent infrastructure bottleneck",
      url: "https://thenewstack.io/ai-agent-bottleneck",
      canonical_url: "https://thenewstack.io/ai-agent-bottleneck",
    })).toBeNull();
    expect(extractEntityCandidate({
      ...base,
      title: "Show HN: Visuali – An AI agent for image editing",
      url: "https://visuali.io",
      canonical_url: "https://visuali.io/",
    })).toMatchObject({ name: "Visuali", officialDomain: "visuali.io" });
  });

  it("rejects non-Show HN articles on otherwise unknown hosts", () => {
    const base = {
      ...githubItem,
      source: "hacker_news" as const,
      raw_payload_json: {},
      raw_metrics_json: { points: 42, comments: 12 },
    };
    expect(extractEntityCandidate({
      ...base,
      title: "Perplexity unveils a secure sandbox platform for AI agents",
      body: "Introducing a new AI agent platform",
      url: "https://example-news-site.com/perplexity-space",
      canonical_url: "https://example-news-site.com/perplexity-space",
    })).toBeNull();
  });

  it("accepts a direct GitHub product repository shared on HN", () => {
    const candidate = extractEntityCandidate({
      ...githubItem,
      source: "hacker_news",
      title: "Open source AI agent workflow tool",
      body: "A platform for autonomous agent workflows",
      url: "https://github.com/acme/agent-workflow",
      canonical_url: "https://github.com/acme/agent-workflow",
      raw_payload_json: {},
      raw_metrics_json: { points: 20, comments: 4 },
    });
    expect(candidate).toMatchObject({ officialDomain: "github.com", isOpenSource: true });
  });

  it("extracts an AI Product Hunt launch and rejects non-AI launches", () => {
    const base = {
      ...githubItem,
      source: "product_hunt" as const,
      title: "Agentflow",
      raw_metrics_json: { votes: 842, comments: 96 },
    };
    const aiCandidate = extractEntityCandidate({
      ...base,
      url: "https://agentflow.ai",
      canonical_url: "https://agentflow.ai/",
      raw_payload_json: {
        name: "Agentflow",
        tagline: "Build and ship autonomous AI agents without code",
        description: "A no-code platform to deploy autonomous AI agents.",
        website: "https://agentflow.ai",
        url: "https://www.producthunt.com/posts/agentflow",
        votesCount: 842,
        commentsCount: 96,
        topics: { edges: [{ node: { name: "Artificial Intelligence" } }] },
      },
    });
    expect(aiCandidate).toMatchObject({
      name: "Agentflow",
      officialDomain: "agentflow.ai",
      source: "product_hunt",
      matchMethod: "official_domain",
    });
    expect(aiCandidate?.confidence).toBe(0.9);

    const nonAi = extractEntityCandidate({
      ...base,
      title: "DeskPlant",
      url: "https://deskplant.co",
      canonical_url: "https://deskplant.co/",
      raw_metrics_json: { votes: 233, comments: 18 },
      raw_payload_json: {
        name: "DeskPlant",
        tagline: "A smart planter that waters your office plants",
        description: "Keeps your desk plants alive automatically.",
        website: "https://deskplant.co",
        url: "https://www.producthunt.com/posts/deskplant",
        votesCount: 233,
        commentsCount: 18,
        topics: { edges: [{ node: { name: "Home" } }] },
      },
    });
    expect(nonAi).toBeNull();
  });

  it("creates deterministic bootstrap scores with WATCH status", () => {
    const candidate = extractEntityCandidate(githubItem);
    expect(candidate).not.toBeNull();
    const score = calculateInitialTrendScore([candidate!], new Date("2026-07-20T00:00:00.000Z"));
    expect(score.status).toBe("WATCH");
    expect(score.totalScore).toBeGreaterThan(0);
    expect(score.scoringVersion).toBe("v1-bootstrap");
  });

  it("uses a stable hash slug when a name has no latin characters", () => {
    expect(slugifyName("오늘의 도구", "https://example.com")).toMatch(/^ai-service-[a-f0-9]{10}$/u);
  });
});
