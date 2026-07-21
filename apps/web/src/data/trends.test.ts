import { describe, expect, it } from "vitest";
import { getTrend, trends } from "./trends";

describe("dashboard fixture", () => {
  it("provides an ordered top ten with explainable signals", () => {
    expect(trends).toHaveLength(10);
    expect(trends.map(({ rank }) => rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(trends.every(({ whyTrending, signals }) => whyTrending.length > 0 && signals.length > 0)).toBe(true);
  });

  it("resolves a service by its public slug", () => {
    expect(getTrend("browser-use")?.trendScore).toBe(92);
  });
});
