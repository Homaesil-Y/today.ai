import { describe, expect, it } from "vitest";
import { SupabasePipelineRepository } from "./repository";

/**
 * 읽기 경로의 재시도 회귀 테스트.
 *
 * 2026-09-12~13 에 Supabase 가 504 Gateway Timeout 을 간헐 반환하자 실행 5건이 통째로 죽었다.
 * 원인은 재시도가 쓰기에만 배선돼 있었던 것 — postgrest-js 는 읽기도 `[520, 503]` 만 재시도하므로
 * 504 는 무방비였다. 실패한 쿼리는 load_categories(응답 1.2KB, 평소 0.12초)처럼 작은 것들이라
 * "쿼리가 무거워서"가 아니라 순수한 일시 장애였다.
 */
function fakeClient(plan: { failures: number; message: string }) {
  const calls: string[] = [];
  let remaining = plan.failures;
  const settle = (table: string) => {
    calls.push(table);
    if (remaining > 0) { remaining -= 1; return Promise.resolve({ data: null, error: { message: plan.message } }); }
    return Promise.resolve({ data: [], error: null });
  };
  const chain = (table: string): Record<string, unknown> => {
    const self: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "lt", "order", "range", "limit"]) {
      self[m] = () => self;
    }
    self.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      settle(table).then(resolve, reject);
    return self;
  };
  return { calls, client: { from: (table: string) => chain(table) } };
}

describe("읽기 재시도", () => {
  it("일시적 504 는 다시 시도해 성공한다", async () => {
    const fake = fakeClient({ failures: 1, message: "Gateway Timeout" });
    const repository = new SupabasePipelineRepository(fake.client as never);

    await expect(repository.loadScoreHistory(["e1"], "2026-09-15", "v3-bootstrap")).resolves.toBeInstanceOf(Map);

    // 실패 1회 + 성공 1회
    expect(fake.calls.filter((t) => t === "trend_scores").length).toBe(2);
  });

  it("영구 오류는 재시도하지 않고 바로 던진다", async () => {
    const fake = fakeClient({ failures: 99, message: 'column "nope" does not exist' });
    const repository = new SupabasePipelineRepository(fake.client as never);

    await expect(repository.loadScoreHistory(["e1"], "2026-09-15", "v3-bootstrap")).rejects.toThrow(/does not exist/u);
    expect(fake.calls.filter((t) => t === "trend_scores").length).toBe(1);
  });

  it("504 가 계속되면 3회 시도 후 포기한다", async () => {
    const fake = fakeClient({ failures: 99, message: "Gateway Timeout" });
    const repository = new SupabasePipelineRepository(fake.client as never);

    await expect(repository.loadScoreHistory(["e1"], "2026-09-15", "v3-bootstrap")).rejects.toThrow(/Gateway Timeout/u);
    expect(fake.calls.filter((t) => t === "trend_scores").length).toBe(3);
  });
});
