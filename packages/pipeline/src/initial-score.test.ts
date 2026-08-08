import { describe, expect, it } from "vitest";
import { EngagementPercentiles } from "./engagement-percentile";
import { calculateInitialTrendScore, velocityFromRank } from "./initial-score";
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

/** 실측 분포를 축약한 표본. HN은 한 자릿수, PH는 세 자릿수로 척도가 100배 가까이 다르다. */
const samples = new EngagementPercentiles([
  ...[1, 2, 2, 3, 4, 10, 40, 300, 824].map((value) => ({ source: "hacker_news" as const, value })),
  ...[120, 194, 194, 250, 352, 400, 469, 600, 892].map((value) => ({ source: "product_hunt" as const, value })),
]);

describe("calculateInitialTrendScore", () => {
  // Product Hunt의 votes와 Reddit의 score는 필드명이 각 채널 고유라 initial-score.ts가 한동안
  // 읽지 않았다. 그 결과 순수 Product Hunt 엔티티는 velocity_score가 영원히 0으로 고정돼
  // 화면의 "24H 변화"가 새 서비스가 아닌데도 항상 "초기 집계"로만 표시됐다.
  it("counts Product Hunt votes toward velocity, not just HN points", () => {
    const phOnly = candidate({ source: "product_hunt", metrics: { votes: 400, comments: 30 } });
    const score = calculateInitialTrendScore([phOnly], now, samples);
    expect(score.breakdown.velocity).toBeGreaterThan(0);
  });

  it("counts Reddit score toward the dedicated reddit axis", () => {
    const redditOnly = candidate({ source: "reddit", metrics: { score: 500, comments: 40 } });
    const score = calculateInitialTrendScore([redditOnly], now, samples);
    expect(score.breakdown.reddit).toBeGreaterThan(0);
    // Reddit 신호가 velocity 축까지 새어 들어가진 않아야 한다.
    expect(score.breakdown.velocity).toBe(0);
  });

  it("still treats Hacker News points as the velocity signal", () => {
    const hnOnly = candidate({ source: "hacker_news", metrics: { points: 300, comments: 20 } });
    const score = calculateInitialTrendScore([hnOnly], now, samples);
    expect(score.breakdown.velocity).toBeGreaterThan(0);
    expect(score.breakdown.reddit).toBe(0);
  });

  it("scores engagement by standing within the channel, not by raw count", () => {
    // 이 역전이 실제 장애였다: PH 중앙값(194표)이 HN 상위권(824점)보다 높은 velocity 를 받아
    // 공개 엔티티는 HN 60%/PH 36%인데 상위 50위가 PH 48건으로 채워졌다.
    const hnStrong = calculateInitialTrendScore(
      [candidate({ source: "hacker_news", metrics: { points: 824 } })], now, samples,
    );
    const phTypical = calculateInitialTrendScore(
      [candidate({ source: "product_hunt", metrics: { votes: 194 } })], now, samples,
    );
    expect(hnStrong.breakdown.velocity).toBeGreaterThan(phTypical.breakdown.velocity);
  });

  it("gives each channel's top performer the same velocity", () => {
    const hnTop = calculateInitialTrendScore(
      [candidate({ source: "hacker_news", metrics: { points: 824 } })], now, samples,
    );
    const phTop = calculateInitialTrendScore(
      [candidate({ source: "product_hunt", metrics: { votes: 892 } })], now, samples,
    );
    expect(hnTop.breakdown.velocity).toBe(phTop.breakdown.velocity);
  });

  it("takes the larger of HN points and PH votes when a product has both", () => {
    const both = candidate({ source: "hacker_news", metrics: { points: 10, votes: 824 } });
    const hnAlone = calculateInitialTrendScore(
      [candidate({ source: "hacker_news", metrics: { points: 824 } })], now, samples,
    );
    expect(calculateInitialTrendScore([both], now, samples).breakdown.velocity)
      .toBe(hnAlone.breakdown.velocity);
  });

  it("leaves velocity and reddit at 0 when a product has neither signal (e.g. GitHub-only)", () => {
    const githubOnly = candidate({ source: "github", metrics: { stars: 200, forks: 10 } });
    const score = calculateInitialTrendScore([githubOnly], now, samples);
    expect(score.breakdown.velocity).toBe(0);
    expect(score.breakdown.reddit).toBe(0);
    expect(score.breakdown.productGrowth).toBeGreaterThan(0);
  });

  it("gives no velocity when the distribution is unknown rather than guessing", () => {
    // 분포 없이 호출되면(과거 호출부) 절대값으로 추측하지 않는다.
    const phOnly = candidate({ source: "product_hunt", metrics: { votes: 400 } });
    expect(calculateInitialTrendScore([phOnly], now).breakdown.velocity).toBe(0);
  });
});

describe("velocityFromRank", () => {
  it("weights the tail more than the middle", () => {
    // 백분위를 그대로 쓰면 824점과 40점이 뭉뚱그려진다. 제곱으로 꼬리를 살린다.
    expect(velocityFromRank(0.5)).toBe(5);
    expect(velocityFromRank(0.9)).toBe(16.2);
    expect(velocityFromRank(1)).toBe(20);
  });

  it("clamps out-of-range input", () => {
    expect(velocityFromRank(-1)).toBe(0);
    expect(velocityFromRank(2)).toBe(20);
  });
});
