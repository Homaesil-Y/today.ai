import { describe, expect, it } from "vitest";
import { calculateStatus, calculateTrendScore, canonicalizeUrl, engagementSignal, MAX_TREND_SCORE } from "./index";

const zero = { crossSource: 0, velocity: 0, comments: 0, productGrowth: 0, threads: 0, reddit: 0, novelty: 0, instagram: 0, quality: 0 };

describe("calculateTrendScore", () => {
  it("is deterministic and caps every weighted component", () => {
    const input = { ...zero, crossSource: 30, velocity: 18, comments: 9, productGrowth: 14, threads: 11, reddit: 9, novelty: 8, instagram: 4, quality: 5 };
    // crossSource 는 상한 20 으로 깎이고, productGrowth·threads·reddit·instagram 은 상한 0 이라 버려진다.
    expect(calculateTrendScore(input)).toBe(20 + 18 + 9 + 8 + 5);
    expect(calculateTrendScore(input)).toBe(calculateTrendScore(input));
  });

  /**
   * 상한 0 인 축(threads·reddit·instagram·productGrowth)에 값이 들어와도 총점에 반영되지 않아야 한다.
   * 채널이 열려 상한을 올릴 때까지, 이 축들은 명목상 존재하지만 점수에 기여하지 않는다.
   */
  it("상한 0 인 축은 값이 있어도 총점에 들어가지 않는다", () => {
    expect(calculateTrendScore({ ...zero, threads: 12, reddit: 10, instagram: 5, productGrowth: 15 })).toBe(0);
  });

  it("모든 축이 상한이면 총점이 MAX_TREND_SCORE(100)와 같다", () => {
    const full = { ...zero, crossSource: 20, velocity: 40, comments: 20, novelty: 15, quality: 5 };
    expect(calculateTrendScore(full)).toBe(MAX_TREND_SCORE);
    expect(MAX_TREND_SCORE).toBe(100);
  });
});

describe("engagementSignal", () => {
  /** 상태 판정과 순위 하한이 보는 값. 달력(novelty)·설명(quality) 축은 들어가지 않아야 한다. */
  it("반응 축만 더하고 novelty·quality 는 무시한다", () => {
    expect(engagementSignal({ ...zero, velocity: 10, comments: 5, crossSource: 6.7, novelty: 15, quality: 5 })).toBe(21.7);
  });

  it("축 상한을 넘는 값은 상한으로 깎는다", () => {
    expect(engagementSignal({ ...zero, velocity: 99 })).toBe(40);
  });
});

describe("calculateStatus", () => {
  /**
   * v3 임계값은 2026-08-26~09-01 저장 스냅샷 5,246건의 전이를 v3 척도로 환산해 유도했다.
   * 판정은 총점이 아니라 반응 신호(engagementSignal)의 변화만 본다 — v2 까지는 총점 차이를 봐서
   * novelty 계단(7일·30일)이 내려가는 날 모든 엔티티가 FALLING 이 됐다(실측 FALLING 의 68%).
   */
  const aged = { firstDetectedHours: 100, dataPoints: 3 };

  it("발견 24시간 이내는 이력이 없어도 NEW", () => {
    expect(calculateStatus({ firstDetectedHours: 12, signal: 30, previousSignal: 30, dataPoints: 1 })).toBe("NEW");
    expect(calculateStatus({ firstDetectedHours: 12, signal: 30, previousSignal: 10, dataPoints: 3 })).toBe("NEW");
  });

  it("발견 24시간이 지났는데 비교할 스냅샷이 없으면 WATCH", () => {
    expect(calculateStatus({ ...aged, dataPoints: 1, signal: 50, previousSignal: 50 })).toBe("WATCH");
  });

  it("반응 신호가 하루 +10 이상 뛰면 SURGING", () => {
    expect(calculateStatus({ ...aged, signal: 22, previousSignal: 11 })).toBe("SURGING");
  });

  /** v2 의 왜곡: 절대 점수가 높으면 하락 중이어도 SURGING 이었다. 이제 변화가 없으면 급등이 아니다. */
  it("높은 점수라도 변화가 없으면 SURGING 이 아니다", () => {
    expect(calculateStatus({ ...aged, signal: 50, previousSignal: 50.5 })).not.toBe("SURGING");
  });

  it("상위 1%(40↑)에서 변화 없이 머무르면 PEAK", () => {
    expect(calculateStatus({ ...aged, signal: 45, previousSignal: 44.2 })).toBe("PEAK");
  });

  it("상위권이 감쇠로 -3 이상 내려가면 FALLING (정점 유지가 아니다)", () => {
    expect(calculateStatus({ ...aged, signal: 41, previousSignal: 44.8 })).toBe("FALLING");
  });

  it("+3 이상 오르면 RISING", () => {
    expect(calculateStatus({ ...aged, signal: 14, previousSignal: 10.5 })).toBe("RISING");
  });

  it("-3 이상 내리면 FALLING", () => {
    expect(calculateStatus({ ...aged, signal: 30, previousSignal: 33.5 })).toBe("FALLING");
  });

  /** 감쇠만으로 중위권이 내는 하루 하락(S=10 → -0.9)은 FALLING 이 아니어야 한다. */
  it("중위권의 감쇠 폭(±1 이내)은 STABLE", () => {
    expect(calculateStatus({ ...aged, signal: 9.1, previousSignal: 10 })).toBe("STABLE");
    expect(calculateStatus({ ...aged, signal: 10.9, previousSignal: 10 })).toBe("STABLE");
  });

  /** novelty 계단은 signal 에 없으므로, 반응이 그대로인 엔티티는 7일째에도 STABLE 이어야 한다. */
  it("반응이 그대로면 발견 7일째에도 FALLING 이 아니다", () => {
    expect(calculateStatus({ firstDetectedHours: 24 * 7 + 1, dataPoints: 8, signal: 12, previousSignal: 12 })).toBe("STABLE");
  });

  it("일주일 넘게 조용했던(신호 <3) 엔티티가 +3 이상 뛰면 REVIVAL", () => {
    expect(calculateStatus({ firstDetectedHours: 24 * 10, dataPoints: 10, signal: 8, previousSignal: 1 })).toBe("REVIVAL");
  });

  it("생긴 지 일주일 안 된 엔티티의 첫 신호는 REVIVAL 이 아니라 상승 규칙으로 잡는다", () => {
    expect(calculateStatus({ ...aged, signal: 8, previousSignal: 1 })).toBe("RISING");
    expect(calculateStatus({ ...aged, signal: 20, previousSignal: 1 })).toBe("SURGING");
  });
});

describe("canonicalizeUrl", () => {
  it("removes tracking and normalizes host and trailing slash", () => {
    expect(canonicalizeUrl("https://WWW.Example.com/tool/?utm_source=hn&b=2&a=1#top")).toBe(
      "https://example.com/tool?a=1&b=2",
    );
  });
});
