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

describe("calculateStatus (실측 척도 보정)", () => {
  /**
   * 원래 임계값은 명목 100점 척도를 전제해 SURGING(≥85)·PEAK(≥80)·REVIVAL(≥60)에 도달 가능한
   * 점수가 존재하지 않았다(2026-08-25 실측 최고 34.6). 아래는 보정된 임계값이 실제 분포에서
   * 각 상태에 도달할 수 있음을 고정한다.
   */
  const base = { firstDetectedHours: 100, dataPoints: 3 };

  it("실측 최고점(34.6)이 SURGING 에 도달한다", () => {
    expect(calculateStatus({ ...base, velocityDelta: 0, score: 34.6, previousScore: 34 })).toBe("SURGING");
  });

  it("하루 +8 급등이 SURGING 이 된다", () => {
    expect(calculateStatus({ ...base, velocityDelta: 9, score: 17, previousScore: 8 })).toBe("SURGING");
  });

  it("최상위권에서 변화 없이 머무르면 PEAK", () => {
    expect(calculateStatus({ ...base, velocityDelta: 0.5, score: 27, previousScore: 26.5 })).toBe("PEAK");
  });

  it("+3 상승이면 RISING", () => {
    expect(calculateStatus({ ...base, velocityDelta: 3, score: 14, previousScore: 11 })).toBe("RISING");
  });

  it("-2 하락이면 FALLING (novelty 계단 -3, 감쇠로 도달 가능해야 한다)", () => {
    expect(calculateStatus({ ...base, velocityDelta: -3, score: 8, previousScore: 11 })).toBe("FALLING");
  });

  it("낮은 점수에서 상위권 진입이면 REVIVAL 이 아니라 상승 규칙이 먼저 잡는다", () => {
    // +5 이상 오르면 RISING 이 먼저 매칭된다 — REVIVAL 은 정의상 도달하기 어렵지만 규칙은 남긴다.
    expect(calculateStatus({ ...base, velocityDelta: 6, score: 21, previousScore: 14 })).toBe("RISING");
  });

  it("작은 흔들림(±1)은 STABLE 로 남는다", () => {
    expect(calculateStatus({ ...base, velocityDelta: 1, score: 12, previousScore: 11 })).toBe("STABLE");
    expect(calculateStatus({ ...base, velocityDelta: -1, score: 10, previousScore: 11 })).toBe("STABLE");
  });

  it("발견 24시간 이내는 여전히 NEW", () => {
    expect(calculateStatus({ firstDetectedHours: 10, dataPoints: 3, velocityDelta: 0, score: 12, previousScore: 12 })).toBe("NEW");
  });
});
