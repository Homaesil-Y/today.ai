import { describe, expect, it } from "vitest";
import { brakeFor, EGRESS_BRAKES, MAX_SITE_CACHE_MULTIPLIER, SUPABASE_FREE_EGRESS_BYTES } from "@ai-trend-radar/types/egress";
import { brakeFromMeter, decideRun, meterSinceDay } from "./run-brake";

/**
 * 자동 브레이크(2026-10-30). Supabase 가 "Grace period is over" 상태라 다음 초과는 유예 없이 바로 제한된다.
 * 사용량이 경고·위험 단계면 우리 쪽에서 먼저 읽기 빈도를 줄여야 한다.
 */
describe("브레이크 단계", () => {
  it("단계가 오를수록 느려지고, 정상 단계는 예전 동작과 같다", () => {
    expect(EGRESS_BRAKES.ok).toMatchObject({ siteCacheMultiplier: 1, rescoreIntervalMinutes: 150, analysisIntervalMinutes: 0 });
    for (const [slower, faster] of [[EGRESS_BRAKES.warn, EGRESS_BRAKES.ok], [EGRESS_BRAKES.alert, EGRESS_BRAKES.warn]] as const) {
      expect(slower.siteCacheMultiplier).toBeGreaterThan(faster.siteCacheMultiplier);
      expect(slower.rescoreIntervalMinutes).toBeGreaterThan(faster.rescoreIntervalMinutes);
      expect(slower.analysisIntervalMinutes).toBeGreaterThan(faster.analysisIntervalMinutes);
    }
    expect(MAX_SITE_CACHE_MULTIPLIER).toBe(EGRESS_BRAKES.alert.siteCacheMultiplier);
    expect(brakeFor(undefined)).toBe(EGRESS_BRAKES.ok);
  });

  it("계량 기록이 없으면(테이블 미적용·조회 실패) 브레이크를 걸지 않는다", () => {
    expect(brakeFromMeter(null, new Date("2026-11-05T00:00:00Z"), 23).level).toBe("ok");
  });

  it("이 속도면 한도를 넘는 사용량이면 위험 단계 브레이크", () => {
    const now = new Date("2026-11-05T12:00:00Z");
    const days = ["2026-11-02", "2026-11-03", "2026-11-04"].map((day) => ({ day, bytes: SUPABASE_FREE_EGRESS_BYTES / 10 }));
    expect(brakeFromMeter(days, now, 23).level).toBe("alert");
  });

  it("평소 사용량이면 정상", () => {
    const now = new Date("2026-11-05T12:00:00Z");
    const days = ["2026-11-02", "2026-11-03", "2026-11-04"].map((day) => ({ day, bytes: 70_000_000 }));
    expect(brakeFromMeter(days, now, 23).level).toBe("ok");
  });

  it("계량 기록은 주기 시작 3일 전부터 읽는다", () => {
    expect(meterSinceDay(new Date("2026-11-05T00:00:00Z"), 23)).toBe("2026-10-20");
  });
});

describe("실행 여부", () => {
  it("정상 단계: 채점은 150분 간격, 분석은 늘 실행", () => {
    expect(decideRun({ mode: "score", force: false, brake: EGRESS_BRAKES.ok, minutesSinceScore: 100, minutesSinceAnalysis: null }).run).toBe(false);
    expect(decideRun({ mode: "score", force: false, brake: EGRESS_BRAKES.ok, minutesSinceScore: 151, minutesSinceAnalysis: null }).run).toBe(true);
    expect(decideRun({ mode: "score", force: false, brake: EGRESS_BRAKES.ok, minutesSinceScore: null, minutesSinceAnalysis: null }).run).toBe(true);
    expect(decideRun({ mode: "analysis", force: false, brake: EGRESS_BRAKES.ok, minutesSinceScore: null, minutesSinceAnalysis: 5 }).run).toBe(true);
  });

  it("경고 단계: 채점·분석 모두 6시간 간격", () => {
    const score = decideRun({ mode: "score", force: false, brake: EGRESS_BRAKES.warn, minutesSinceScore: 200, minutesSinceAnalysis: null });
    expect(score.run).toBe(false);
    if (!score.run) expect(score.reason).toMatch(/자동 브레이크/u);
    expect(decideRun({ mode: "analysis", force: false, brake: EGRESS_BRAKES.warn, minutesSinceScore: null, minutesSinceAnalysis: 120 }).run).toBe(false);
    expect(decideRun({ mode: "analysis", force: false, brake: EGRESS_BRAKES.warn, minutesSinceScore: null, minutesSinceAnalysis: 400 }).run).toBe(true);
  });

  it("위험 단계: 하루 2회", () => {
    expect(decideRun({ mode: "score", force: false, brake: EGRESS_BRAKES.alert, minutesSinceScore: 600, minutesSinceAnalysis: null }).run).toBe(false);
    expect(decideRun({ mode: "analysis", force: false, brake: EGRESS_BRAKES.alert, minutesSinceScore: null, minutesSinceAnalysis: 600 }).run).toBe(false);
    expect(decideRun({ mode: "analysis", force: false, brake: EGRESS_BRAKES.alert, minutesSinceScore: null, minutesSinceAnalysis: 721 }).run).toBe(true);
  });

  it("--force 와 수동 전체 실행은 브레이크를 무시한다", () => {
    expect(decideRun({ mode: "score", force: true, brake: EGRESS_BRAKES.alert, minutesSinceScore: 1, minutesSinceAnalysis: null }).run).toBe(true);
    expect(decideRun({ mode: "full", force: false, brake: EGRESS_BRAKES.alert, minutesSinceScore: 1, minutesSinceAnalysis: 1 }).run).toBe(true);
  });
});
