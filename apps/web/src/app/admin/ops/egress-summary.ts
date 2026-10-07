import {
  billingCycleStart,
  DAILY_EGRESS_BUDGET_BYTES,
  evaluateEgressBudget,
  type EgressBudget,
} from "@ai-trend-radar/types/egress";

/**
 * /admin/ops 의 Supabase 전송량 카드에 들어갈 값. 판정 규칙은 packages/types/src/egress.ts.
 * 계량 테이블은 마이그레이션 202610070001_egress_meter.sql 로 만든다 — 그 전이면 "missing".
 */
export type EgressDayBar = { day: string; bytes: number; metered: boolean; isToday: boolean };
export type EgressSourceShare = { source: string; bytes: number };

export type EgressSummary =
  | { state: "missing" }
  | { state: "error"; message: string }
  | {
    state: "ready";
    budget: EgressBudget;
    days: EgressDayBar[];
    /** 막대 높이의 기준(하루 예산의 1.25배와 가장 큰 날 중 큰 값). */
    scaleBytes: number;
    yesterdaySources: EgressSourceShare[];
    todaySources: EgressSourceShare[];
  };

type MeterResult = {
  data: Array<{ day: unknown; source: unknown; bytes: unknown }> | null;
  error: { code?: string | null; message: string } | null;
};

const DAY_MS = 86_400_000;

function topSources(rows: Array<{ day: string; source: string; bytes: number }>, day: string, limit = 5): EgressSourceShare[] {
  return rows
    .filter((row) => row.day === day)
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, limit)
    .map(({ source, bytes }) => ({ source, bytes }));
}

export function summarizeEgress(result: MeterResult, now: Date, cycleDay: number): EgressSummary {
  if (result.error) {
    const missing = result.error.code === "PGRST205" || result.error.code === "42P01"
      || /egress_meter_daily/u.test(result.error.message);
    return missing ? { state: "missing" } : { state: "error", message: result.error.message };
  }

  const rows = (result.data ?? []).map((row) => ({
    day: String(row.day),
    source: String(row.source),
    bytes: Math.max(0, Number(row.bytes) || 0),
  }));
  const budget = evaluateEgressBudget({ days: rows, now, cycleDay });

  const byDay = new Map<string, number>();
  for (const row of rows) byDay.set(row.day, (byDay.get(row.day) ?? 0) + row.bytes);
  const today = now.toISOString().slice(0, 10);
  const days: EgressDayBar[] = [];
  for (let time = billingCycleStart(now, cycleDay).getTime(); ; time += DAY_MS) {
    const day = new Date(time).toISOString().slice(0, 10);
    if (day > today) break;
    days.push({
      day,
      bytes: byDay.get(day) ?? 0,
      metered: budget.firstMeteredDay !== null && day >= budget.firstMeteredDay,
      isToday: day === today,
    });
  }
  const largest = days.reduce((max, bar) => Math.max(max, bar.bytes), 0);
  const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - DAY_MS).toISOString().slice(0, 10);

  return {
    state: "ready",
    budget,
    days,
    scaleBytes: Math.max(DAILY_EGRESS_BUDGET_BYTES * 1.25, largest),
    yesterdaySources: topSources(rows, yesterday),
    todaySources: topSources(rows, today),
  };
}
