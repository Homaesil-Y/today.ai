import { describe, expect, it } from "vitest";
import { DAILY_EGRESS_BUDGET_BYTES } from "@ai-trend-radar/types/egress";
import { summarizeEgress } from "./egress-summary";

/** /admin/ops 전송량 카드. 계량 테이블이 없을 때와 있을 때 화면이 할 말을 정한다. */
const now = new Date("2026-10-10T06:00:00Z"); // 주기 9/23 ~ 10/23

describe("전송량 카드 요약", () => {
  it("마이그레이션 전(테이블 없음)이면 설치 안내 상태", () => {
    const summary = summarizeEgress({ data: null, error: { code: "PGRST205", message: "Could not find the table 'public.egress_meter_daily' in the schema cache" } }, now, 23);
    expect(summary.state).toBe("missing");
  });

  it("그 밖의 오류는 메시지를 보여준다", () => {
    const summary = summarizeEgress({ data: null, error: { code: "PGRST301", message: "JWT expired" } }, now, 23);
    expect(summary).toEqual({ state: "error", message: "JWT expired" });
  });

  it("주기 시작부터 오늘까지 날짜별 막대를 만들고, 계량 전 날은 구분한다", () => {
    const summary = summarizeEgress({
      data: [
        { day: "2026-10-08", source: "web:trends-list", bytes: 40_000_000 },
        { day: "2026-10-09", source: "web:trends-list", bytes: 30_000_000 },
        { day: "2026-10-09", source: "gh:pipeline", bytes: 12_000_000 },
        { day: "2026-10-10", source: "gh:pipeline", bytes: "5000000" },
      ],
      error: null,
    }, now, 23);

    if (summary.state !== "ready") throw new Error("ready 여야 한다");
    expect(summary.days[0]?.day).toBe("2026-09-23");
    expect(summary.days.at(-1)).toEqual({ day: "2026-10-10", bytes: 5_000_000, metered: true, isToday: true });
    expect(summary.days.find((bar) => bar.day === "2026-10-07")?.metered).toBe(false);
    expect(summary.days.find((bar) => bar.day === "2026-10-09")?.bytes).toBe(42_000_000);
    expect(summary.yesterdaySources).toEqual([
      { source: "web:trends-list", bytes: 30_000_000 },
      { source: "gh:pipeline", bytes: 12_000_000 },
    ]);
    expect(summary.scaleBytes).toBe(DAILY_EGRESS_BUDGET_BYTES * 1.25);
    expect(summary.budget.coversWholeCycle).toBe(false);
  });
});
