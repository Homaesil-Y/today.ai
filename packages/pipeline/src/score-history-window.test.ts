import { describe, expect, it } from "vitest";
import { SCORE_HISTORY_LOOKBACK_DAYS, scoreHistoryWindowStart, SupabasePipelineRepository } from "./repository";

/**
 * 점수 이력 읽기의 기간 창 회귀 테스트.
 *
 * 2026-10-06 22:36Z 부터 Supabase 가 egress 한도 초과(exceed_egress_quota)로 프로젝트를 차단해
 * 모든 워크플로와 사이트가 멈췄다. 원인 중 하나가 이 읽기였다 — 같은 척도의 이력 전체를 매 실행
 * 읽어, 하루 약 1,600행씩 커졌다(10/06 기준 약 5.8만 행, 압축 후 약 1.8MB/실행). 분석 전용 실행까지
 * 매번 읽었다. 창이 빠지면 다시 "조용히 매일 커지는" 읽기가 되므로 쿼리에 창이 걸리는지 확인한다.
 */
type Call = { table: string; filters: Array<[string, unknown[]]> };

function recordingClient(anchorDate: string | null, rows: Array<Record<string, unknown>>) {
  const calls: Call[] = [];
  const chain = (table: string) => {
    const call: Call = { table, filters: [] };
    calls.push(call);
    const self: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "lt", "gte", "order", "range", "limit", "maybeSingle"]) {
      self[m] = (...args: unknown[]) => { call.filters.push([m, args]); return self; };
    }
    self.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
      const isAnchor = call.filters.some(([m]) => m === "maybeSingle");
      const data = isAnchor ? (anchorDate ? { score_date: anchorDate } : null) : rows;
      return Promise.resolve({ data, error: null, status: 200 }).then(resolve, reject);
    };
    return self;
  };
  return { calls, client: { from: (table: string) => chain(table) } };
}

describe("점수 이력 기간 창", () => {
  it("창 시작일은 마지막 채점일에서 LOOKBACK 일 전이다", () => {
    expect(SCORE_HISTORY_LOOKBACK_DAYS).toBeLessThanOrEqual(7);
    expect(scoreHistoryWindowStart("2026-10-06")).toBe("2026-10-03");
    expect(scoreHistoryWindowStart("2026-03-01", 3)).toBe("2026-02-26");
    expect(() => scoreHistoryWindowStart("nope")).toThrow(RangeError);
  });

  it("이력 쿼리에 마지막 채점일 기준 창이 걸린다", async () => {
    const fake = recordingClient("2026-10-06", [
      { entity_id: "e1", score_date: "2026-10-06", velocity_score: 10, comments_score: 2, product_growth_score: 0, cross_source_score: 0 },
      { entity_id: "e1", score_date: "2026-10-05", velocity_score: 5, comments_score: 1, product_growth_score: 0, cross_source_score: 0 },
    ]);
    const repository = new SupabasePipelineRepository(fake.client as never);

    const summary = await repository.loadScoreHistory(["e1"], "2026-10-07", "v3-bootstrap");

    const history = fake.calls.find((c) => c.filters.some(([m]) => m === "range"));
    expect(history?.filters).toContainEqual(["gte", ["score_date", "2026-10-03"]]);
    expect(history?.filters).toContainEqual(["lt", ["score_date", "2026-10-07"]]);
    // 직전 스냅샷 + 창 안의 이전 1건 + 이번 실행분
    expect(summary.get("e1")?.dataPoints).toBe(3);
  });

  it("오늘 이전 채점이 하나도 없으면 이력 쿼리를 보내지 않는다", async () => {
    const fake = recordingClient(null, []);
    const repository = new SupabasePipelineRepository(fake.client as never);

    const summary = await repository.loadScoreHistory(["e1"], "2026-10-07", "v3-bootstrap");

    expect(summary.size).toBe(0);
    expect(fake.calls.filter((c) => c.filters.some(([m]) => m === "range"))).toHaveLength(0);
  });

  it("파이프라인이 오래 멈췄다 재개돼도 직전 스냅샷을 찾는다(창 기준이 오늘이 아니다)", async () => {
    const fake = recordingClient("2026-09-20", [
      { entity_id: "e1", score_date: "2026-09-20", velocity_score: 10, comments_score: 0, product_growth_score: 0, cross_source_score: 0 },
    ]);
    const repository = new SupabasePipelineRepository(fake.client as never);

    const summary = await repository.loadScoreHistory(["e1"], "2026-10-07", "v3-bootstrap");

    const history = fake.calls.find((c) => c.filters.some(([m]) => m === "range"));
    expect(history?.filters).toContainEqual(["gte", ["score_date", "2026-09-17"]]);
    expect(summary.get("e1")?.dataPoints).toBe(2);
  });
});
