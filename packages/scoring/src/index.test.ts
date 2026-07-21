import { describe, expect, it } from "vitest";
import { calculateStatus, calculateTrendScore, canonicalizeUrl } from "./index";

describe("calculateTrendScore", () => {
  it("is deterministic and caps every weighted component", () => {
    const input = {
      crossSource: 30,
      velocity: 18,
      productGrowth: 14,
      threads: 11,
      reddit: 9,
      novelty: 8,
      instagram: 4,
      quality: 5,
    };
    expect(calculateTrendScore(input)).toBe(94);
    expect(calculateTrendScore(input)).toBe(94);
  });
});

describe("calculateStatus", () => {
  it("uses WATCH when snapshot evidence is insufficient", () => {
    expect(
      calculateStatus({
        firstDetectedHours: 2,
        velocityDelta: 80,
        score: 91,
        previousScore: 20,
        dataPoints: 1,
      }),
    ).toBe("WATCH");
  });
});

describe("canonicalizeUrl", () => {
  it("removes tracking and normalizes host and trailing slash", () => {
    expect(canonicalizeUrl("https://WWW.Example.com/tool/?utm_source=hn&b=2&a=1#top")).toBe(
      "https://example.com/tool?a=1&b=2",
    );
  });
});
