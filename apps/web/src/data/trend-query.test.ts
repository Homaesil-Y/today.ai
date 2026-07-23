import { describe, expect, it } from "vitest";
import type { TrendEntity } from "@ai-trend-radar/types";
import { trends } from "./trends";
import { compareByScore, filterAndSortTrends, summarizeCategories } from "./trend-query";

describe("trend query", () => {
  it("searches Korean descriptions and service names", () => {
    expect(filterAndSortTrends(trends, { q: "브라우저" }).map(({ slug }) => slug)).toContain("browser-use");
    expect(filterAndSortTrends(trends, { q: "MCP Inspector" })[0]?.slug).toBe("mcp-inspector");
  });

  it("combines category, source and trust filters", () => {
    const result = filterAndSortTrends(trends, { category: "개발·코딩", source: "github", minTrust: 90 });
    expect(result.map(({ slug }) => slug)).toEqual(["mcp-inspector"]);
  });

  it("sorts by trust and summarizes categories", () => {
    expect(filterAndSortTrends(trends, { sort: "trust" })[0]?.slug).toBe("mcp-inspector");
    expect(summarizeCategories(trends).reduce((sum, item) => sum + item.count, 0)).toBe(trends.length);
  });

  it("breaks score ties deterministically (rank order == default display order)", () => {
    // 동점일 때 신뢰도→이름 순으로 완전 결정. rank 부여와 탐색 정렬이 같은 순서를 내야 순위 역전이 없다.
    const tied = [
      { name: "Bravo", trendScore: 20, trustScore: 80 },
      { name: "Alpha", trendScore: 20, trustScore: 80 },
      { name: "Charlie", trendScore: 20, trustScore: 90 },
    ] as TrendEntity[];
    expect([...tied].sort(compareByScore).map(({ name }) => name)).toEqual(["Charlie", "Alpha", "Bravo"]);
    // 기본 정렬(filterAndSortTrends score)도 동일한 순서를 내야 한다.
    const defaultSorted = filterAndSortTrends(tied, {}).map(({ name }) => name);
    expect(defaultSorted).toEqual([...tied].sort(compareByScore).map(({ name }) => name));
  });
});

