import { describe, expect, it } from "vitest";
import { chunkRows, dedupeByKey, DEFAULT_BATCH_ROWS } from "./batch-write";
import { describeSupabaseError, isRetryableSupabaseFailure } from "./repository";

describe("chunkRows", () => {
  it("빈 배열은 요청을 만들지 않는다", () => {
    expect(chunkRows([])).toEqual([]);
  });

  it("상한 이하면 한 청크로 둔다", () => {
    expect(chunkRows([1, 2, 3], 5)).toEqual([[1, 2, 3]]);
  });

  it("상한을 넘으면 나눈다", () => {
    expect(chunkRows([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("기본 상한은 500행이다", () => {
    const rows = Array.from({ length: 1_200 }, (_, index) => index);
    expect(chunkRows(rows).map((chunk) => chunk.length)).toEqual([500, 500, 200]);
    expect(DEFAULT_BATCH_ROWS).toBe(500);
  });

  it("0 이하 크기는 거부한다", () => {
    expect(() => chunkRows([1], 0)).toThrow(RangeError);
  });
});

describe("dedupeByKey", () => {
  /**
   * 이 테스트가 막는 실제 실패: Postgres 는 `ON CONFLICT DO UPDATE` 로 한 문장에서 같은 행을
   * 두 번 건드리면 "cannot affect row a second time" 으로 문장 전체를 거부한다. 후보를 한 건씩
   * 보낼 때는 드러나지 않던 문제라, 배치로 묶는 순간 중복 제거가 필수가 된다.
   */
  it("충돌 키가 같은 행을 하나로 합친다", () => {
    const rows = [
      { entity_id: "e1", alias: "Foo", confidence: 0.5 },
      { entity_id: "e1", alias: "Foo", confidence: 0.9 },
      { entity_id: "e1", alias: "Bar", confidence: 0.4 },
      { entity_id: "e2", alias: "Foo", confidence: 0.3 },
    ];
    const deduped = dedupeByKey(rows, (row) => `${row.entity_id}|${row.alias}`);
    expect(deduped).toHaveLength(3);
  });

  it("나중 값을 남긴다(같은 실행에서 더 최신 관측이 이긴다)", () => {
    const rows = [
      { entity_id: "e1", alias: "Foo", confidence: 0.5 },
      { entity_id: "e1", alias: "Foo", confidence: 0.9 },
    ];
    const deduped = dedupeByKey(rows, (row) => `${row.entity_id}|${row.alias}`);
    expect(deduped).toEqual([{ entity_id: "e1", alias: "Foo", confidence: 0.9 }]);
  });

  it("입력 순서를 보존한다", () => {
    const rows = [{ k: "b" }, { k: "a" }, { k: "b" }];
    expect(dedupeByKey(rows, (row) => row.k)).toEqual([{ k: "b" }, { k: "a" }]);
  });

  it("빈 입력은 빈 배열이다", () => {
    expect(dedupeByKey([], (row: { k: string }) => row.k)).toEqual([]);
  });
});

describe("isRetryableSupabaseFailure", () => {
  /**
   * 2026-08-25 07:11Z 실행을 죽인 실제 메시지. postgrest-js 는 POST·PATCH 를 비멱등으로 보고
   * 재시도하지 않는데, 이 파이프라인의 쓰기는 전부 onConflict upsert 라 멱등이다.
   */
  it.each([
    "TypeError: fetch failed",
    "TypeError: fetch failed | code=ECONNRESET",
    "request to https://x.supabase.co failed, reason: socket hang up",
    "connect ETIMEDOUT 1.2.3.4:443",
    "getaddrinfo EAI_AGAIN db.supabase.co",
    "UND_ERR_HEADERS_OVERFLOW",
    "remaining connection slots are reserved / too many connections",
    "503 Service Unavailable",
  ])("일시적 실패로 본다: %s", (message) => {
    expect(isRetryableSupabaseFailure(message)).toBe(true);
  });

  /** 재시도해도 결과가 같은 오류는 즉시 포기해야 한다 — 안 그러면 같은 실패를 3배로 기다린다. */
  it.each([
    'duplicate key value violates unique constraint "entities_slug_key"',
    'null value in column "name" violates not-null constraint',
    "new row violates row-level security policy",
    'invalid input syntax for type uuid: "nope"',
    "ON CONFLICT DO UPDATE command cannot affect row a second time",
  ])("영구 실패로 본다: %s", (message) => {
    expect(isRetryableSupabaseFailure(message)).toBe(false);
  });
});

describe("describeSupabaseError", () => {
  /**
   * 예전엔 message 만 던져서 fetch 실패가 전부 "TypeError: fetch failed" 한 줄로 올라왔고,
   * 원인(ECONNRESET / DNS / 헤드 초과)을 구분할 수 없었다.
   */
  it("code 와 details 를 함께 남긴다", () => {
    const described = describeSupabaseError({
      message: "TypeError: fetch failed",
      code: "ECONNRESET",
      details: "FetchError: fetch failed\n\nCaused by: Error: read ECONNRESET (ECONNRESET)",
    });
    expect(described).toContain("TypeError: fetch failed");
    expect(described).toContain("ECONNRESET");
    expect(described).toContain("Caused by");
  });

  it("details 스택이 길어도 앞부분만 남긴다", () => {
    const described = describeSupabaseError({
      message: "boom",
      details: ["a", "b", "c", "d", "e"].join("\n"),
    });
    expect(described).toContain("a / b / c");
    expect(described).not.toContain("d");
  });

  it("부가 정보가 없으면 메시지만 남긴다", () => {
    expect(describeSupabaseError({ message: "boom" })).toBe("boom");
    expect(describeSupabaseError({ message: "boom", code: null, details: null, hint: null })).toBe("boom");
  });
});

describe("isRetryableSupabaseFailure — 504 회귀", () => {
  /**
   * 2026-09-12~13 실행 5건을 죽인 실제 메시지. postgrest-js 의 재시도 대상 상태코드는
   * `[520, 503]` 뿐이라 504 는 읽기에서도 재시도되지 않는다 — 그래서 우리가 직접 판정한다.
   */
  it.each([
    "Gateway Timeout",
    "gateway timeout",
    "504 Gateway Timeout",
  ])("Supabase 504 를 일시적 실패로 본다: %s", (message) => {
    expect(isRetryableSupabaseFailure(message)).toBe(true);
  });

  /** 읽기에서도 같은 판정을 써야 한다. 쓰기 전용으로 읽히던 옛 이름이 배선을 좁혔다. */
  it("읽기·쓰기 구분 없이 같은 판정을 쓴다", () => {
    expect(isRetryableSupabaseFailure("TypeError: fetch failed")).toBe(true);
    expect(isRetryableSupabaseFailure('duplicate key value violates unique constraint')).toBe(false);
  });
});
