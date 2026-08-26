import { describe, expect, it } from "vitest";
import { calculateStatus, calculateTrendScore, canonicalizeUrl, MAX_TREND_SCORE } from "./index";

describe("calculateTrendScore", () => {
  it("is deterministic and caps every weighted component", () => {
    const input = {
      crossSource: 30,
      velocity: 18,
      comments: 9,
      productGrowth: 14,
      threads: 11,
      reddit: 9,
      novelty: 8,
      instagram: 4,
      quality: 5,
    };
    // crossSource 는 상한 20 으로 깎이고, threads·reddit·instagram 은 상한 0 이라 버려진다.
    expect(calculateTrendScore(input)).toBe(20 + 18 + 9 + 14 + 8 + 5);
    expect(calculateTrendScore(input)).toBe(calculateTrendScore(input));
  });

  /**
   * 죽은 축(threads·reddit·instagram)에 값이 들어와도 총점에 반영되지 않아야 한다. 채널이 열려
   * 상한을 올릴 때까지, 이 축들은 명목상 존재하지만 점수에 기여하지 않는다.
   */
  it("수집 경로가 막힌 축은 값이 있어도 총점에 들어가지 않는다", () => {
    const base = { crossSource: 0, velocity: 0, comments: 0, productGrowth: 0, threads: 0, reddit: 0, novelty: 0, instagram: 0, quality: 0 };
    expect(calculateTrendScore({ ...base, threads: 12, reddit: 10, instagram: 5 })).toBe(0);
  });

  it("모든 축이 상한이면 총점이 MAX_TREND_SCORE(100)와 같다", () => {
    const full = { crossSource: 20, velocity: 30, comments: 15, productGrowth: 15, threads: 0, reddit: 0, novelty: 12, instagram: 0, quality: 8 };
    expect(calculateTrendScore(full)).toBe(MAX_TREND_SCORE);
    expect(MAX_TREND_SCORE).toBe(100);
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

describe("calculateStatus (v2 척도 보정)", () => {
  /**
   * 원래 임계값은 명목 100점 척도를 전제해 SURGING(≥85)·PEAK(≥80)·REVIVAL(≥60)에 도달 가능한
   * 점수가 존재하지 않았다. 아래는 v2 실측 분포(793건: 최고 59.4 · 상위1% 42.7 · 중앙 12.6)에서
   * 각 상태가 실제로 도달 가능함을 고정한다 — 하나라도 도달 불가로 돌아가면 이 테스트가 깨진다.
   */
  const base = { firstDetectedHours: 100, dataPoints: 3 };

  it("상위 1%(42.7↑) 점수는 변화가 없어도 SURGING", () => {
    expect(calculateStatus({ ...base, velocityDelta: 0, score: 45, previousScore: 45 })).toBe("SURGING");
    expect(calculateStatus({ ...base, velocityDelta: 0, score: 59.4, previousScore: 59 })).toBe("SURGING");
  });

  it("하루 +10 급등이면 점수가 낮아도 SURGING", () => {
    expect(calculateStatus({ ...base, velocityDelta: 11, score: 24, previousScore: 13 })).toBe("SURGING");
  });

  it("상위 2% 부근에서 변화 없이 머무르면 PEAK", () => {
    expect(calculateStatus({ ...base, velocityDelta: 0.5, score: 39, previousScore: 38.5 })).toBe("PEAK");
  });

  it("+4 상승이면 RISING", () => {
    expect(calculateStatus({ ...base, velocityDelta: 4, score: 17, previousScore: 13 })).toBe("RISING");
  });

  /** 감쇠가 만드는 전형적 하락폭이 FALLING 으로 잡혀야 한다(예전엔 -8 이라 도달 불가였다). */
  it("-3 하락이면 FALLING", () => {
    expect(calculateStatus({ ...base, velocityDelta: -3, score: 10, previousScore: 13 })).toBe("FALLING");
  });

  it("중앙값 아래에서 상위 10% 수준으로 뛰면 상승 규칙이 먼저 잡는다", () => {
    // RISING(+4) 이 REVIVAL 보다 앞에 있어 먼저 매칭된다. REVIVAL 규칙은 정의상 도달하기 어렵다.
    expect(calculateStatus({ ...base, velocityDelta: 13, score: 25, previousScore: 12 })).toBe("SURGING");
  });

  it("작은 흔들림(±2)은 STABLE 로 남는다", () => {
    expect(calculateStatus({ ...base, velocityDelta: 2, score: 14, previousScore: 12 })).toBe("STABLE");
    expect(calculateStatus({ ...base, velocityDelta: -2, score: 10, previousScore: 12 })).toBe("STABLE");
  });

  it("발견 24시간 이내는 여전히 NEW", () => {
    expect(calculateStatus({ firstDetectedHours: 10, dataPoints: 3, velocityDelta: 0, score: 12, previousScore: 12 })).toBe("NEW");
  });

  it("이력이 없으면(척도 전환 직후 포함) WATCH", () => {
    expect(calculateStatus({ ...base, dataPoints: 1, velocityDelta: 0, score: 50, previousScore: 50 })).toBe("WATCH");
  });
});
