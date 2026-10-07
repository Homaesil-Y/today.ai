import { describe, expect, it } from "vitest";
import { loadDailyReportTop } from "./daily-report";
import { isMissingMeterObject, parseMeterLines } from "./egress-report";
import { SupabasePipelineRepository } from "./repository";

/**
 * 2026-10-06 Supabase egress 한도 초과(프로젝트 차단)의 재발 방지 테스트.
 * "이력이 쌓일수록 매 실행 읽는 양이 늘어나는" 쿼리가 다시 들어오지 않는지 쿼리 모양으로 확인한다.
 */
type Call = { table: string; ops: Array<[string, unknown[]]> };

function recordingClient(respond: (call: Call) => { data: unknown; count?: number }) {
  const calls: Call[] = [];
  const from = (table: string) => {
    const call: Call = { table, ops: [] };
    calls.push(call);
    const self: Record<string, unknown> = {};
    for (const op of ["select", "eq", "in", "lt", "gte", "order", "range", "limit", "maybeSingle"]) {
      self[op] = (...args: unknown[]) => { call.ops.push([op, args]); return self; };
    }
    self.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
      const { data, count } = respond(call);
      return Promise.resolve({ data, count: count ?? null, error: null, status: 200 }).then(resolve, reject);
    };
    return self;
  };
  return { calls, client: { from } };
}

const has = (call: Call, op: string) => call.ops.some(([name]) => name === op);
const selectOf = (call: Call) => String(call.ops.find(([name]) => name === "select")?.[1][0] ?? "");

describe("일간 리포트는 최근 채점일의 상위 N건만 읽는다", () => {
  it("이력 전체를 붙여 읽지 않고, 상위 N건과 그 요약만 가져온다", async () => {
    const fake = recordingClient((call) => {
      if (call.table === "entities") return { data: null, count: 1619 };
      if (call.table === "trend_scores" && has(call, "maybeSingle")) return { data: { score_date: "2026-10-06" } };
      if (call.table === "trend_scores") {
        return {
          data: [
            { entity_id: "e1", total_score: 61.2, trust_score: 80, status: "RISING", entities: { slug: "a", name: "A", categories: { name: "에이전트" } } },
            { entity_id: "e2", total_score: 55, trust_score: 70, status: "STABLE", entities: { slug: "b", name: "B", categories: null } },
          ],
        };
      }
      return { data: [{ entity_id: "e1", summary: "요약 A" }] };
    });

    const report = await loadDailyReportTop(fake.client as never, 10, "v3-bootstrap");

    expect(report.totalPublic).toBe(1619);
    expect(report.scoreDate).toBe("2026-10-06");
    expect(report.topServices).toEqual([
      { rank: 1, slug: "a", name: "A", category: "에이전트", trendScore: 61.2, trustScore: 80, status: "RISING", summary: "요약 A" },
      { rank: 2, slug: "b", name: "B", category: "기타", trendScore: 55, trustScore: 70, status: "STABLE", summary: null },
    ]);

    // 엔티티에 점수·분석 이력을 붙여 읽던 예전 쿼리가 돌아오면 안 된다.
    for (const call of fake.calls) {
      expect(selectOf(call)).not.toMatch(/trend_scores\(|ai_analyses\(/u);
    }
    const top = fake.calls.find((call) => call.table === "trend_scores" && has(call, "limit") && !has(call, "maybeSingle"));
    expect(top?.ops).toContainEqual(["limit", [10]]);
    expect(top?.ops).toContainEqual(["eq", ["score_date", "2026-10-06"]]);
    expect(fake.calls.find((call) => call.table === "latest_ai_analyses")?.ops).toContainEqual(["in", ["entity_id", ["e1", "e2"]]]);
    expect(fake.calls.some((call) => call.table === "ai_analyses")).toBe(false);
  });

  it("공개 엔티티 수는 행을 받지 않고 센다", async () => {
    const fake = recordingClient((call) => (call.table === "entities" ? { data: null, count: 0 } : { data: null }));
    await loadDailyReportTop(fake.client as never, 10);
    const entities = fake.calls.find((call) => call.table === "entities");
    expect(entities?.ops[0]).toEqual(["select", ["id", { count: "exact", head: true }]]);
  });
});

describe("분석 대기열의 최근 분석 시각은 엔티티별 최신 1행 뷰에서 읽는다", () => {
  it("ai_analyses 이력 전체를 읽지 않는다", async () => {
    const fake = recordingClient(() => ({ data: [{ entity_id: "e1", generated_at: "2026-10-05T01:00:00Z" }] }));
    const repository = new SupabasePipelineRepository(fake.client as never);

    const latest = await repository.loadLatestAnalysisAt(["e1"], "trend-analysis-v1");

    expect(latest.get("e1")).toBe(Date.parse("2026-10-05T01:00:00Z"));
    expect(fake.calls.map((call) => call.table)).toEqual(["latest_ai_analyses"]);
  });
});

describe("계량 파일 집계", () => {
  it("같은 날·같은 이름은 합치고 깨진 줄은 건너뛴다", () => {
    const text = [
      JSON.stringify({ day: "2026-10-07", label: "pipeline", requests: 3, bytes: 1_000 }),
      "{\"day\":\"2026-10-07\",\"lab", // 쓰다 끊긴 줄
      JSON.stringify({ day: "2026-10-07", label: "pipeline", requests: 2, bytes: 500 }),
      JSON.stringify({ day: "2026-10-07", label: "verify", requests: 9, bytes: 5_400 }),
      JSON.stringify({ day: "bad", label: "x", requests: 1, bytes: 1 }),
      "",
    ].join("\r\n");

    expect(parseMeterLines(text)).toEqual([
      { day: "2026-10-07", label: "pipeline", requests: 5, bytes: 1_500 },
      { day: "2026-10-07", label: "verify", requests: 9, bytes: 5_400 },
    ]);
  });

  it("마이그레이션 미적용 오류를 알아본다", () => {
    expect(isMissingMeterObject({ code: "PGRST205", message: "Could not find the table 'public.egress_meter_daily'" })).toBe(true);
    expect(isMissingMeterObject({ code: "PGRST202", message: "Could not find the function public.record_egress" })).toBe(true);
    expect(isMissingMeterObject({ code: "42501", message: "permission denied" })).toBe(false);
    expect(isMissingMeterObject(null)).toBe(false);
  });
});
