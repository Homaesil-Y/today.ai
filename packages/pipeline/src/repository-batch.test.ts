import { beforeEach, describe, expect, it } from "vitest";
import { SupabasePipelineRepository, type BootstrapScoreRecord } from "./repository";

type Call = { table: string; verb: string; rows?: unknown[]; filterCount?: number };

/**
 * 왕복 횟수를 세는 최소 Supabase 스텁.
 *
 * 이 테스트의 목적은 "결과가 같은가"가 아니라 "요청을 몇 번 보내는가"다. 후보 828건을 한 건씩
 * 쓰던 구조가 job timeout(15분)에 걸려 2026-08-24 에 두 번 취소됐기 때문에, 왕복 수는 회귀하면
 * 안 되는 성질이 됐다.
 */
function fakeClient(options: { failFirst?: { times: number; message: string } } = {}) {
  const calls: Call[] = [];
  let remainingFailures = options.failFirst?.times ?? 0;

  const settle = (call: Call) => {
    calls.push(call);
    if (remainingFailures > 0) {
      remainingFailures -= 1;
      return Promise.resolve({ data: null, error: { message: options.failFirst?.message ?? "boom" } });
    }
    return Promise.resolve({ data: null, error: null });
  };

  return {
    calls,
    client: {
      from(table: string) {
        return {
          upsert(rows: unknown[]) {
            return settle({ table, verb: "upsert", rows });
          },
          update() {
            return {
              in(_column: string, ids: string[]) {
                return settle({ table, verb: "update", filterCount: ids.length });
              },
            };
          },
        };
      },
    },
  };
}

function score(status: BootstrapScoreRecord["status"], total = 10): BootstrapScoreRecord {
  return {
    breakdown: { crossSource: 1, velocity: 1, productGrowth: 1, threads: 0, reddit: 0, novelty: 1, instagram: 0, quality: 1 },
    totalScore: total,
    status,
    trustScore: 80,
    scoringVersion: "v1",
  };
}

describe("saveScores", () => {
  let fake: ReturnType<typeof fakeClient>;
  let repository: SupabasePipelineRepository;

  beforeEach(() => {
    fake = fakeClient();
    repository = new SupabasePipelineRepository(fake.client as never);
  });

  it("빈 목록은 요청을 보내지 않는다", async () => {
    await repository.saveScores([], "2026-08-25");
    expect(fake.calls).toHaveLength(0);
  });

  /**
   * 이전 구조는 엔티티당 2회(trend_scores upsert + entities update)였다. 781건이면 1,562회.
   */
  it("엔티티 800건을 점수 2회 + 상태 1회로 저장한다", async () => {
    const records = Array.from({ length: 800 }, (_, index) => ({
      entityId: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      score: score("STABLE"),
    }));

    const result = await repository.saveScores(records, "2026-08-25");

    expect(result.scores).toBe(800);
    const upserts = fake.calls.filter((call) => call.verb === "upsert");
    const updates = fake.calls.filter((call) => call.verb === "update");
    // 800행 / 배치 500행 = 2회
    expect(upserts).toHaveLength(2);
    expect(upserts.every((call) => call.table === "trend_scores")).toBe(true);
    // 상태가 한 종류뿐이라 update 는 청크 수만큼(id 길이 기준)
    expect(updates.every((call) => call.table === "entities")).toBe(true);
    // 예전 구조(1,600회)보다 훨씬 적어야 한다.
    expect(fake.calls.length).toBeLessThan(30);
  });

  it("상태별로 묶어서 update 한다", async () => {
    const records = [
      { entityId: "e1", score: score("RISING") },
      { entityId: "e2", score: score("RISING") },
      { entityId: "e3", score: score("FALLING") },
    ];

    await repository.saveScores(records, "2026-08-25");

    const updates = fake.calls.filter((call) => call.verb === "update");
    expect(updates).toHaveLength(2);
    expect(updates.map((call) => call.filterCount).sort()).toEqual([1, 2]);
  });

  it("같은 엔티티가 두 번 들어오면 한 행으로 합친다", async () => {
    await repository.saveScores([
      { entityId: "e1", score: score("STABLE", 10) },
      { entityId: "e1", score: score("STABLE", 20) },
    ], "2026-08-25");

    const upsert = fake.calls.find((call) => call.verb === "upsert");
    expect(upsert?.rows).toHaveLength(1);
    expect((upsert?.rows?.[0] as { total_score: number }).total_score).toBe(20);
  });
});

describe("쓰기 재시도", () => {
  /** 2026-08-25 07:11Z 실행을 죽인 상황: 왕복 수천 회 중 한 번의 fetch 실패. */
  it("일시적 실패는 다시 시도해 성공한다", async () => {
    const fake = fakeClient({ failFirst: { times: 1, message: "TypeError: fetch failed" } });
    const repository = new SupabasePipelineRepository(fake.client as never);

    await expect(repository.saveScores([{ entityId: "e1", score: score("STABLE") }], "2026-08-25")).resolves.toBeTruthy();

    const upserts = fake.calls.filter((call) => call.table === "trend_scores");
    expect(upserts).toHaveLength(2); // 실패 1회 + 성공 1회
  });

  it("영구 실패는 재시도하지 않고 바로 던진다", async () => {
    const fake = fakeClient({ failFirst: { times: 99, message: 'null value in column "status" violates not-null constraint' } });
    const repository = new SupabasePipelineRepository(fake.client as never);

    await expect(repository.saveScores([{ entityId: "e1", score: score("STABLE") }], "2026-08-25")).rejects.toThrow(/not-null/u);

    expect(fake.calls.filter((call) => call.table === "trend_scores")).toHaveLength(1);
  });

  it("일시적 실패가 계속되면 3회 시도 후 포기한다", async () => {
    const fake = fakeClient({ failFirst: { times: 99, message: "TypeError: fetch failed" } });
    const repository = new SupabasePipelineRepository(fake.client as never);

    await expect(repository.saveScores([{ entityId: "e1", score: score("STABLE") }], "2026-08-25")).rejects.toThrow(/fetch failed/u);

    expect(fake.calls.filter((call) => call.table === "trend_scores")).toHaveLength(3);
  });
});
