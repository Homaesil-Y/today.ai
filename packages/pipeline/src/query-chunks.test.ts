import { describe, expect, it } from "vitest";
import { chunkForFilter, readAllPages } from "./query-chunks";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("chunkForFilter", () => {
  it("keeps a short list in a single request", () => {
    expect(chunkForFilter([uuid(1), uuid(2)])).toEqual([[uuid(1), uuid(2)]]);
  });

  it("splits a list that would overflow the request URL", () => {
    // 실제 장애 조건: 엔티티 414건을 한 요청에 넣어 URL 16,280자가 되어 undici 가 fetch 를 거부했다.
    const ids = Array.from({ length: 414 }, (_, i) => uuid(i));
    const chunks = chunkForFilter(ids);
    expect(chunks.length).toBeGreaterThan(1);
    // 청크마다 필터 문자열이 상한 안에 들어와야 한다.
    for (const chunk of chunks) {
      const filterChars = chunk.reduce((sum, id) => sum + id.length + 3, 0);
      expect(filterChars).toBeLessThanOrEqual(4_000);
    }
  });

  it("loses no values and preserves order", () => {
    const ids = Array.from({ length: 414 }, (_, i) => uuid(i));
    expect(chunkForFilter(ids).flat()).toEqual(ids);
  });

  it("splits long values sooner than short ones", () => {
    // canonical_url 은 UUID 보다 훨씬 길어서 같은 개수라도 URL 을 더 많이 차지한다.
    const urls = Array.from({ length: 60 }, (_, i) => `https://example.com/${"p".repeat(100)}/${i}`);
    const ids = Array.from({ length: 60 }, (_, i) => uuid(i));
    expect(chunkForFilter(urls).length).toBeGreaterThan(chunkForFilter(ids).length);
  });

  it("returns no chunks for an empty list", () => {
    expect(chunkForFilter([])).toEqual([]);
  });

  it("still sends a single value that exceeds the limit on its own", () => {
    // 조용히 누락되면 "미분석"으로 오판되므로, 실패할 수 있어도 버리지 않는다.
    const huge = "x".repeat(5_000);
    expect(chunkForFilter([huge], 4_000)).toEqual([[huge]]);
  });

  it("rejects a non-positive limit", () => {
    expect(() => chunkForFilter([uuid(1)], 0)).toThrow(RangeError);
  });
});

describe("readAllPages", () => {
  it("stops after a short page", async () => {
    const calls: Array<[number, number]> = [];
    const rows = await readAllPages(async (from, to) => {
      calls.push([from, to]);
      return [1, 2];
    }, 3);
    expect(rows).toEqual([1, 2]);
    expect(calls).toEqual([[0, 2]]);
  });

  it("keeps paging while full pages come back", async () => {
    const all = Array.from({ length: 7 }, (_, i) => i);
    const calls: Array<[number, number]> = [];
    const rows = await readAllPages(async (from, to) => {
      calls.push([from, to]);
      return all.slice(from, to + 1);
    }, 3);
    expect(rows).toEqual(all);
    expect(calls).toEqual([[0, 2], [3, 5], [6, 8]]);
  });

  it("returns nothing when the first page is empty", async () => {
    expect(await readAllPages(async () => [], 3)).toEqual([]);
  });

  it("propagates a query failure instead of silently truncating", async () => {
    await expect(readAllPages(async () => { throw new Error("boom"); })).rejects.toThrow("boom");
  });
});
