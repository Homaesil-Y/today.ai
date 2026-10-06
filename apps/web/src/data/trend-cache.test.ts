import type { TrendEntity } from "@ai-trend-radar/types";
import { describe, expect, it } from "vitest";
import { logoTextFrom } from "./display-name";
import { sourceSignalLabel } from "./entity-sources";
import {
  cachePayloadUsage,
  expandTrend,
  LIST_SCORE_WINDOW_DAYS,
  mergeSlices,
  NEXT_DATA_CACHE_ITEM_LIMIT,
  scoreWindowStart,
  sliceTrends,
  TREND_CACHE_SLICE_SIZE,
  toCompactTrend,
} from "./trend-cache";

/**
 * 2026-10-06 Supabase egress 한도 초과(프로젝트 차단)의 재발 방지 테스트. 배경은 trend-cache.ts.
 */

// 8/26 실제 캐시 항목과 같은 길이의 필드(한국어 요약 약 78자, 이유 3문장, 스파크라인 12점).
function realisticTrend(index: number): TrendEntity {
  const name = `서비스 이름 ${index}`;
  const description = "가".repeat(78);
  const delta = index % 3 === 0 ? null : 1.4;
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    slug: `service-name-${index}`,
    name,
    logoText: logoTextFrom(name),
    tagline: description,
    description,
    category: "AI 에이전트",
    canonicalUrl: `https://example-${index}.com/product/landing`,
    githubUrl: `https://github.com/example/repo-${index}`,
    pricingType: "freemium",
    isOpenSource: false,
    status: "STABLE",
    rank: index + 1,
    ranked: true,
    rankChange: -2,
    trendScore: 41.3,
    trustScore: 77,
    sources: ["hacker_news", "github"],
    signals: [{
      source: "hacker_news",
      label: sourceSignalLabel("hacker_news"),
      value: 41.3,
      delta24h: delta,
      unit: "engagement",
      measuredAt: "2026-10-06T16:57:03.123+00:00",
      reliability: "estimated",
    }],
    whyTrending: ["나".repeat(40), "다".repeat(40), "라".repeat(40)],
    strengths: [],
    weaknesses: [],
    useCases: [],
    targetUsers: [],
    koreaOpportunity: "",
    updatedAt: "2026-10-06T16:57:03.123+00:00",
    firstDetectedAt: "2026-09-01T03:12:44.000+00:00",
    sparkline: [41.3, 40.1, 39.8, 38.2, 37.7, 36.1, 35.5, 34.9, 33.3, 32.8, 31.1, 30.4],
  };
}

describe("점수 이력 기간 창", () => {
  it("창은 가장 최근 채점 시각에서 LIST_SCORE_WINDOW_DAYS 일 전부터다", () => {
    expect(LIST_SCORE_WINDOW_DAYS).toBeGreaterThanOrEqual(12); // 스파크라인 12점
    expect(LIST_SCORE_WINDOW_DAYS).toBeLessThanOrEqual(31); // 창이 길어지면 읽기량이 다시 커진다
    expect(scoreWindowStart("2026-10-06T16:57:03.000Z", 13)).toBe("2026-09-23T16:57:03.000Z");
  });

  it("채점 이력이 없거나 시각이 이상하면 필터를 걸지 않는다", () => {
    expect(scoreWindowStart(null)).toBeNull();
    expect(scoreWindowStart(undefined)).toBeNull();
    expect(scoreWindowStart("nope")).toBeNull();
  });
});

describe("압축형 캐시 항목", () => {
  it("압축했다 복원하면 화면이 쓰는 값이 전부 같다", () => {
    for (const trend of [realisticTrend(0), realisticTrend(1)]) {
      const restored = expandTrend(toCompactTrend(trend));
      expect(restored).toEqual(trend);
    }
  });

  it("githubUrl 이 없는 항목도 키를 새로 만들지 않는다", () => {
    const { githubUrl: _omit, ...withoutGithub } = realisticTrend(2);
    const restored = expandTrend(toCompactTrend(withoutGithub));
    expect("githubUrl" in restored).toBe(false);
    expect(restored).toEqual(withoutGithub);
  });

  it("압축형은 원형보다 25% 이상 작다", () => {
    const trend = realisticTrend(3);
    const full = cachePayloadUsage(trend).size;
    const compact = cachePayloadUsage(toCompactTrend(trend)).size;
    expect(compact).toBeLessThan(full * 0.75);
  });
});

describe("조각 캐시", () => {
  const build = (count: number, builtAt = "2026-10-07T00:00:00.000Z") => ({
    builtAt,
    trends: Array.from({ length: count }, (_, i) => toCompactTrend(realisticTrend(i))),
  });

  it("조각 하나는 항목이 지금의 3배로 커져도 Next 캐시 상한 안이다", () => {
    const slice = sliceTrends(build(TREND_CACHE_SLICE_SIZE), 0);
    expect(slice.items).toHaveLength(TREND_CACHE_SLICE_SIZE);
    expect(cachePayloadUsage(slice).size * 3).toBeLessThan(NEXT_DATA_CACHE_ITEM_LIMIT);
  });

  it("조각을 이어 붙이면 원래 순서 그대로다", () => {
    const whole = build(1_234);
    const slices = Array.from({ length: sliceTrends(whole, 0).sliceCount }, (_, i) => sliceTrends(whole, i));
    expect(slices).toHaveLength(Math.ceil(1_234 / TREND_CACHE_SLICE_SIZE));
    expect(mergeSlices(slices)).toEqual(whole.trends);
  });

  it("빈 목록도 조각 1개로 다룬다", () => {
    const slice = sliceTrends(build(0), 0);
    expect(slice.sliceCount).toBe(1);
    expect(mergeSlices([slice])).toEqual([]);
  });

  it("다른 빌드의 조각이 섞이거나 빠지면 이어 붙이지 않는다", () => {
    const a = build(1_200, "2026-10-07T00:00:00.000Z");
    const b = build(1_200, "2026-10-07T00:10:00.000Z");
    expect(mergeSlices([sliceTrends(a, 0), sliceTrends(b, 1), sliceTrends(a, 2)])).toBeNull();
    expect(mergeSlices([sliceTrends(a, 0), sliceTrends(a, 1)])).toBeNull();
    expect(mergeSlices([])).toBeNull();
  });
});
