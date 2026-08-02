import { describe, expect, it } from "vitest";
import { calculateInitialTrendScore } from "./initial-score";
import type { EntityCandidate } from "./schema";

const now = new Date("2026-07-20T00:00:00.000Z");

function candidate(overrides: Partial<EntityCandidate>): EntityCandidate {
  return {
    name: "Test",
    slugBase: "test",
    canonicalUrl: "https://example.com/",
    officialDomain: "example.com",
    githubUrl: null,
    description: "A test candidate",
    categorySlug: "other",
    pricingType: "unknown",
    isOpenSource: false,
    firstDetectedAt: "2026-07-19T00:00:00.000Z",
    lastDetectedAt: "2026-07-19T12:00:00.000Z",
    confidence: 0.8,
    matchMethod: "official_domain",
    alias: "Test",
    rawItem: {} as EntityCandidate["rawItem"],
    source: "hacker_news",
    metrics: {},
    officialFacts: [],
    ...overrides,
  };
}

describe("calculateInitialTrendScore", () => {
  // Product Hunt의 votes와 Reddit의 score는 필드명이 각 채널 고유라 initial-score.ts가 한동안
  // 읽지 않았다. 그 결과 순수 Product Hunt 엔티티는 velocity_score가 영원히 0으로 고정돼
  // 화면의 "24H 변화"가 새 서비스가 아닌데도 항상 "초기 집계"로만 표시됐다(실서비스 Box가
  // 3개월간 매 스냅샷에서 velocity_score=0이었던 것으로 확인).
  it("counts Product Hunt votes toward velocity, not just HN points", () => {
    const phOnly = candidate({ source: "product_hunt", metrics: { votes: 400, comments: 30 } });
    const score = calculateInitialTrendScore([phOnly], now);
    expect(score.breakdown.velocity).toBeGreaterThan(0);
  });

  it("counts Reddit score toward the dedicated reddit axis", () => {
    const redditOnly = candidate({ source: "reddit", metrics: { score: 500, comments: 40 } });
    const score = calculateInitialTrendScore([redditOnly], now);
    expect(score.breakdown.reddit).toBeGreaterThan(0);
    // Reddit 신호가 velocity(HN 전용이 아니게 된) 축까지 새어 들어가진 않아야 한다.
    expect(score.breakdown.velocity).toBe(0);
  });

  it("still treats Hacker News points as the velocity signal", () => {
    const hnOnly = candidate({ source: "hacker_news", metrics: { points: 300, comments: 20 } });
    const score = calculateInitialTrendScore([hnOnly], now);
    expect(score.breakdown.velocity).toBeGreaterThan(0);
    expect(score.breakdown.reddit).toBe(0);
  });

  it("takes the larger of HN points and PH votes when a product has both", () => {
    const both = candidate({ source: "hacker_news", metrics: { points: 10, votes: 900 } });
    const hnAlone = calculateInitialTrendScore([candidate({ source: "hacker_news", metrics: { points: 900 } })], now);
    const mixed = calculateInitialTrendScore([both], now);
    expect(mixed.breakdown.velocity).toBe(hnAlone.breakdown.velocity);
  });

  it("leaves velocity and reddit at 0 when a product has neither signal (e.g. GitHub-only)", () => {
    const githubOnly = candidate({ source: "github", metrics: { stars: 200, forks: 10 } });
    const score = calculateInitialTrendScore([githubOnly], now);
    expect(score.breakdown.velocity).toBe(0);
    expect(score.breakdown.reddit).toBe(0);
    expect(score.breakdown.productGrowth).toBeGreaterThan(0);
  });
});
