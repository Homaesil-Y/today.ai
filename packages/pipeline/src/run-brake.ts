import {
  billingCycleStart,
  brakeFor,
  type EgressBrake,
  evaluateEgressBudget,
} from "@ai-trend-radar/types/egress";

/**
 * 자동 브레이크에 따라 이번 실행을 할지 정한다(규칙은 types/src/egress.ts 의 EGRESS_BRAKES).
 *
 * - 채점 실행: 마지막 채점이 brake.rescoreIntervalMinutes 안이면 건너뛴다(정상 150분 — 예전 고정값과 같다).
 * - 분석 실행: 마지막 분석이 brake.analysisIntervalMinutes 안이면 건너뛴다(정상 0 = 제한 없음).
 * - --force 로 띄운 실행은 언제나 한다.
 *
 * 2026-10-30 "Grace period is over" — 다음 초과는 유예 없이 바로 제한된다. 경고 메일보다 먼저 우리 쪽에서
 * 읽기를 줄이려는 장치다.
 */
export type RunDecision = { run: true; brake: EgressBrake } | { run: false; brake: EgressBrake; reason: string };

export function decideRun(params: {
  mode: "score" | "analysis" | "full";
  force: boolean;
  brake: EgressBrake;
  minutesSinceScore: number | null;
  minutesSinceAnalysis: number | null;
}): RunDecision {
  const { mode, force, brake } = params;
  if (force || mode === "full") return { run: true, brake };

  if (mode === "score") {
    const since = params.minutesSinceScore;
    if (since !== null && since < brake.rescoreIntervalMinutes) {
      return {
        run: false,
        brake,
        reason: `오늘자 채점이 ${Math.round(since)}분 전에 끝났습니다. ${brake.rescoreIntervalMinutes}분 안에는 다시 채점하지 않습니다`
          + `${brake.level === "ok" ? "" : `(전송량 ${brake.level === "warn" ? "경고" : "위험"} 단계 — 자동 브레이크)`}. --force 로 무시.`,
      };
    }
    return { run: true, brake };
  }

  const since = params.minutesSinceAnalysis;
  if (brake.analysisIntervalMinutes > 0 && since !== null && since < brake.analysisIntervalMinutes) {
    return {
      run: false,
      brake,
      reason: `마지막 분석이 ${Math.round(since)}분 전입니다. 전송량 ${brake.level === "warn" ? "경고" : "위험"} 단계라 `
        + `${brake.analysisIntervalMinutes}분 간격으로만 분석합니다(자동 브레이크). --force 로 무시.`,
    };
  }
  return { run: true, brake };
}

/** 계량 기록으로 지금 브레이크 단계를 구한다. 기록이 없으면(테이블 미적용·조회 실패) 정상으로 본다. */
export function brakeFromMeter(days: Array<{ day: string; bytes: number }> | null, now: Date, cycleDay: number): EgressBrake {
  if (!days) return brakeFor("ok");
  return brakeFor(evaluateEgressBudget({ days, now, cycleDay }).level);
}

/** 계량 기록을 어디서부터 읽을지(주기 시작 3일 전부터 — 최근 속도 계산에 필요). */
export function meterSinceDay(now: Date, cycleDay: number): string {
  return new Date(billingCycleStart(now, cycleDay).getTime() - 3 * 86_400_000).toISOString().slice(0, 10);
}
