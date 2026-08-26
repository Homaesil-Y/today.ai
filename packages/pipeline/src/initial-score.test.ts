import { describe, expect, it } from "vitest";
import { ScoreDistributions } from "./engagement-percentile";
import { calculateInitialTrendScore, isRankable, RANKING_SIGNAL_FLOOR, recencyDecay, VELOCITY_CAP, velocityFromRank } from "./initial-score";
import type { TrendScoreBreakdown } from "@ai-trend-radar/types";
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
const samples = new ScoreDistributions([
  ...[1, 2, 2, 3, 4, 10, 40, 300, 824].map((value) => ({ source: "hacker_news" as const, engagement: value, comments: 0 })),
  ...[120, 194, 194, 250, 352, 400, 469, 600, 892].map((value) => ({ source: "product_hunt" as const, engagement: value, comments: value / 4 })),
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

  /**
   * 전용 reddit 축은 채널이 막혀 상한 0 이다(scoring 의 limits 참고). 업보트는 velocity 로 들어가야
   * 한다 — 그러지 않으면 Reddit 수집이 복구되는 날 모든 Reddit 항목이 반응 점수 0 을 받는다.
   */
  it("Reddit 업보트를 velocity 로 반영한다(전용 축은 채널 차단으로 0)", () => {
    const redditSamples = new ScoreDistributions([
      ...[10, 50, 100, 500, 900].map((value) => ({ source: "reddit" as const, engagement: value, comments: 0 })),
    ]);
    const redditOnly = candidate({ source: "reddit", metrics: { score: 500, comments: 40 } });
    const score = calculateInitialTrendScore([redditOnly], now, redditSamples);
    expect(score.breakdown.velocity).toBeGreaterThan(0);
    expect(score.breakdown.reddit).toBe(0);
    // 총점에도 실제로 반영돼야 한다.
    expect(score.totalScore).toBeGreaterThan(score.breakdown.novelty + score.breakdown.quality);
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
    expect(velocityFromRank(0.5)).toBe(7.5);
    expect(velocityFromRank(0.9)).toBe(24.3);
    expect(velocityFromRank(1)).toBe(VELOCITY_CAP);
  });

  it("clamps out-of-range input", () => {
    expect(velocityFromRank(-1)).toBe(0);
    expect(velocityFromRank(2)).toBe(VELOCITY_CAP);
  });
});

describe("recencyDecay (반감기 감쇠)", () => {
  /**
   * 감쇠가 없으면 순위가 멈춘다. 반응 지표는 마지막 수집 시점 값에 얼어붙는데, 원본 대부분이
   * 몇 주 전 수집분이라 매일 같은 점수가 나왔다(실측 8/24→8/25: 변화 중앙값 0, 66% 완전 동일,
   * RISING·FALLING 0건). 자세한 근거는 initial-score.ts 의 ENGAGEMENT_HALF_LIFE_DAYS 참고.
   */
  it("반감기(7일)가 지나면 velocity 가 절반이 된다", () => {
    const fresh = calculateInitialTrendScore(
      [candidate({ source: "hacker_news", metrics: { points: 824 }, lastDetectedAt: now.toISOString() })],
      now, samples,
    );
    const weekOld = calculateInitialTrendScore(
      [candidate({
        source: "hacker_news", metrics: { points: 824 },
        lastDetectedAt: new Date(now.getTime() - 7 * 86_400_000).toISOString(),
      })],
      now, samples,
    );
    expect(weekOld.breakdown.velocity).toBeCloseTo(fresh.breakdown.velocity / 2, 0);
  });

  it("방금 수집된 항목은 감쇠하지 않는다", () => {
    expect(recencyDecay(now.toISOString(), now)).toBe(1);
  });

  it("시각이 미래이거나 깨져 있으면 감쇠하지 않는다(원점수 유지)", () => {
    expect(recencyDecay(new Date(now.getTime() + 3_600_000).toISOString(), now)).toBe(1);
    expect(recencyDecay("not-a-date", now)).toBe(1);
  });

  it("신선하고 약한 언급이 오래되고 강한 언급을 이길 수 있다", () => {
    // 3주 전 최상위(824점) 언급과 오늘의 중상위(40점) 언급이 함께 있으면 오늘 것이 velocity 를 정한다.
    const staleTop = candidate({
      source: "hacker_news", metrics: { points: 824 },
      lastDetectedAt: new Date(now.getTime() - 21 * 86_400_000).toISOString(),
    });
    const freshMid = candidate({
      source: "hacker_news", metrics: { points: 40 },
      lastDetectedAt: now.toISOString(),
    });
    const merged = calculateInitialTrendScore([staleTop, freshMid], now, samples);
    const freshAlone = calculateInitialTrendScore([freshMid], now, samples);
    expect(merged.breakdown.velocity).toBe(freshAlone.breakdown.velocity);
  });

  it("GitHub 스타(productGrowth)도 같은 규칙으로 감쇠한다", () => {
    const stale = calculateInitialTrendScore(
      [candidate({
        source: "github", metrics: { stars: 200 },
        lastDetectedAt: new Date(now.getTime() - 14 * 86_400_000).toISOString(),
      })],
      now, samples,
    );
    const fresh = calculateInitialTrendScore(
      [candidate({ source: "github", metrics: { stars: 200 }, lastDetectedAt: now.toISOString() })],
      now, samples,
    );
    expect(stale.breakdown.productGrowth).toBeCloseTo(fresh.breakdown.productGrowth / 4, 1);
  });
});

describe("isRankable (순위 하한)", () => {
  /**
   * 하한이 없으면 순위 하위 절반이 임의 순서가 된다. 실측(793건): 459건(58%)이 대형 동점 그룹에
   * 몰려 60건이 정확히 같은 점수를 받았다. 근거와 하한 산출은 RANKING_SIGNAL_FLOOR 참고.
   */
  const axes = (overrides: Partial<TrendScoreBreakdown> = {}): TrendScoreBreakdown => ({
    crossSource: 0, velocity: 0, comments: 0, productGrowth: 0,
    threads: 0, reddit: 0, novelty: 0, instagram: 0, quality: 0,
    ...overrides,
  });

  it("반응 신호가 전혀 없으면 순위에서 뺀다", () => {
    // novelty·quality 는 시간·설명에서 나오는 값이라 서비스 간 구분 근거가 못 된다.
    expect(isRankable(axes({ novelty: 12, quality: 8 }))).toBe(false);
  });

  it("반응 신호가 하한을 넘으면 순위에 넣는다", () => {
    expect(isRankable(axes({ velocity: RANKING_SIGNAL_FLOOR }))).toBe(true);
    expect(isRankable(axes({ comments: 3 }))).toBe(true);
    expect(isRankable(axes({ productGrowth: 9 }))).toBe(true);
    expect(isRankable(axes({ crossSource: 6.7 }))).toBe(true);
  });

  it("여러 축에 흩어진 약한 신호도 합쳐서 판단한다", () => {
    expect(isRankable(axes({ velocity: 0.2, comments: 0.2 }))).toBe(false);
    expect(isRankable(axes({ velocity: 0.3, comments: 0.2 }))).toBe(true);
  });

  it("점수 계산 결과에 ranked 가 함께 실린다", () => {
    const strong = calculateInitialTrendScore(
      [candidate({ source: "hacker_news", metrics: { points: 824 }, lastDetectedAt: now.toISOString() })],
      now, samples,
    );
    const noSignal = calculateInitialTrendScore([candidate({ source: "hacker_news", metrics: {} })], now, samples);
    expect(strong.ranked).toBe(true);
    expect(noSignal.ranked).toBe(false);
  });

  /** 오래돼 감쇠로 신호가 사라진 항목은 순위에서 빠져야 한다 — 이게 순위를 움직이는 경로다. */
  it("감쇠로 신호가 하한 아래로 내려가면 순위에서 빠진다", () => {
    const veryStale = calculateInitialTrendScore(
      [candidate({
        source: "hacker_news", metrics: { points: 2 },
        lastDetectedAt: new Date(now.getTime() - 120 * 86_400_000).toISOString(),
      })],
      now, samples,
    );
    expect(veryStale.ranked).toBe(false);
  });
});
