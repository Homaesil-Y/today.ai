import { describe, expect, it } from "vitest";
import { chunkForFilter, readAllByIds, readAllPages } from "./supabase-paging";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("chunkForFilter", () => {
  it("splits an id list that would overflow the request URL", () => {
    // 실측 장애 조건: 공개 엔티티 577건을 한 요청에 넣어 URL 22,633자가 되어 fetch 가 실패했다.
    const ids = Array.from({ length: 577 }, (_, i) => uuid(i));
    const chunks = chunkForFilter(ids);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.reduce((sum, id) => sum + id.length + 3, 0)).toBeLessThanOrEqual(4_000);
    }
  });

  it("loses no ids and keeps their order", () => {
    const ids = Array.from({ length: 577 }, (_, i) => uuid(i));
    expect(chunkForFilter(ids).flat()).toEqual(ids);
  });

  it("keeps a short list in one request", () => {
    expect(chunkForFilter([uuid(1), uuid(2)])).toEqual([[uuid(1), uuid(2)]]);
  });

  it("returns no chunks for an empty list", () => {
    expect(chunkForFilter([])).toEqual([]);
  });

  it("still sends an oversized single value rather than dropping it", () => {
    const huge = "x".repeat(5_000);
    expect(chunkForFilter([huge], 4_000)).toEqual([[huge]]);
  });

  it("rejects a non-positive limit", () => {
    expect(() => chunkForFilter([uuid(1)], 0)).toThrow(RangeError);
  });
});

describe("readAllPages", () => {
  it("keeps paging past the 1000-row response cap", async () => {
    // 실측: trend_scores 6,940행 중 1,000행만 돌아와 점수 이력이 조용히 잘렸다.
    const all = Array.from({ length: 2_300 }, (_, i) => i);
    const rows = await readAllPages(async (from, to) => all.slice(from, to + 1), 1_000);
    expect(rows).toHaveLength(2_300);
  });

  it("stops after a short page", async () => {
    const calls: Array<[number, number]> = [];
    const rows = await readAllPages(async (from, to) => { calls.push([from, to]); return [1, 2]; }, 3);
    expect(rows).toEqual([1, 2]);
    expect(calls).toEqual([[0, 2]]);
  });

  it("propagates a query failure instead of returning partial data", async () => {
    await expect(readAllPages(async () => { throw new Error("boom"); })).rejects.toThrow("boom");
  });
});

describe("readAllByIds", () => {
  it("reads every chunk to the end and concatenates", async () => {
    const ids = Array.from({ length: 250 }, (_, i) => uuid(i));
    const seen: number[] = [];
    const rows = await readAllByIds(ids, async (chunk, from) => {
      if (from > 0) return [];
      seen.push(chunk.length);
      return chunk.map((id) => ({ entity_id: id }));
    });
    expect(rows).toHaveLength(250);
    expect(seen.reduce((a, b) => a + b, 0)).toBe(250);
  });

  it("returns nothing for an empty id list without querying", async () => {
    let called = false;
    const rows = await readAllByIds([], async () => { called = true; return []; });
    expect(rows).toEqual([]);
    expect(called).toBe(false);
  });
});
