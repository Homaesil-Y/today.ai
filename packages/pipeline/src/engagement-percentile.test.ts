import { describe, expect, it } from "vitest";
import { EngagementPercentiles } from "./engagement-percentile";

describe("EngagementPercentiles", () => {
  it("scores the same relative standing the same across channels with different scales", () => {
    // 실측 분포를 축약한 표본: HN은 한 자릿수, PH는 세 자릿수.
    const percentiles = new EngagementPercentiles([
      ...[1, 2, 2, 3, 4, 10, 40, 824].map((value) => ({ source: "hacker_news" as const, value })),
      ...[120, 194, 194, 250, 352, 469, 600, 892].map((source) => ({ source: "product_hunt" as const, value: source })),
    ]);

    // 각 채널의 최상위 값은 채널이 달라도 같은 백분위를 받는다.
    expect(percentiles.rank("hacker_news", 824)).toBe(percentiles.rank("product_hunt", 892));
    // 각 채널의 최하위 값도 마찬가지.
    expect(percentiles.rank("hacker_news", 1)).toBe(percentiles.rank("product_hunt", 120));
  });

  it("stops a typical Product Hunt launch from outranking an exceptional Hacker News post", () => {
    // 이 역전이 실제 장애였다: PH 중앙값이 HN 상위 10%보다 2배 높은 velocity 를 받았다.
    const percentiles = new EngagementPercentiles([
      ...[1, 2, 2, 3, 4, 10, 40, 824].map((value) => ({ source: "hacker_news" as const, value })),
      ...[120, 194, 194, 250, 352, 469, 600, 892].map((value) => ({ source: "product_hunt" as const, value })),
    ]);

    const hnStrong = percentiles.rank("hacker_news", 824);
    const phTypical = percentiles.rank("product_hunt", 194);
    expect(hnStrong).toBeGreaterThan(phTypical);
  });

  it("places a value above the share of samples below it", () => {
    const percentiles = new EngagementPercentiles(
      [10, 20, 30, 40].map((value) => ({ source: "hacker_news" as const, value })),
    );
    expect(percentiles.rank("hacker_news", 10)).toBe(0);
    expect(percentiles.rank("hacker_news", 30)).toBe(0.5);
    expect(percentiles.rank("hacker_news", 999)).toBe(1);
  });

  it("gives no credit to an item with no engagement", () => {
    const percentiles = new EngagementPercentiles(
      [10, 20].map((value) => ({ source: "hacker_news" as const, value })),
    );
    expect(percentiles.rank("hacker_news", 0)).toBe(0);
    expect(percentiles.rank("hacker_news", -5)).toBe(0);
  });

  it("returns zero for a channel with no samples rather than guessing", () => {
    const percentiles = new EngagementPercentiles([{ source: "hacker_news", value: 10 }]);
    expect(percentiles.rank("product_hunt", 500)).toBe(0);
  });

  it("ignores zero and non-finite samples when building the distribution", () => {
    // 0을 분포에 넣으면 실제보다 후한 백분위가 나온다.
    const withZeros = new EngagementPercentiles([
      ...[0, 0, 0, 0].map((value) => ({ source: "hacker_news" as const, value })),
      ...[10, 20].map((value) => ({ source: "hacker_news" as const, value })),
      { source: "hacker_news", value: Number.NaN },
    ]);
    const withoutZeros = new EngagementPercentiles(
      [10, 20].map((value) => ({ source: "hacker_news" as const, value })),
    );
    expect(withZeros.rank("hacker_news", 20)).toBe(withoutZeros.rank("hacker_news", 20));
  });
});
