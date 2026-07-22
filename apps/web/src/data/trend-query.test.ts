import { describe, expect, it } from "vitest";
import { trends } from "./trends";
import { filterAndSortTrends, summarizeCategories } from "./trend-query";

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
});

