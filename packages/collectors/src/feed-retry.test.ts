import { describe, expect, it, vi } from "vitest";
import { FeedHttpError, isRetryableFeedError } from "./rss";
import { withRetry } from "./retry";

/**
 * 2026-09-15 뉴스 실행에서 `VentureBeat 수집 실패: VentureBeat HTTP 429` 가 매번 났다.
 * 재시도는 있었지만 기본 백오프가 250·500ms 라 세 번 모두 같은 429 를 받고 끝났고,
 * 404 같은 영구 오류도 똑같이 세 번씩 시도하며 다른 피드 수집을 늦추고 있었다.
 */
describe("FeedHttpError", () => {
  it("Retry-After 초 단위를 ms 로 읽는다", () => {
    expect(new FeedHttpError("VentureBeat", 429, "30").retryAfterMs).toBe(30_000);
  });

  it("Retry-After HTTP-date 도 읽는다", () => {
    const at = new Date(Date.now() + 20_000).toUTCString();
    const ms = new FeedHttpError("VentureBeat", 429, at).retryAfterMs ?? 0;
    expect(ms).toBeGreaterThan(15_000);
    expect(ms).toBeLessThanOrEqual(21_000);
  });

  it("Retry-After 가 없으면 null 이라 지수 백오프를 쓴다", () => {
    expect(new FeedHttpError("VentureBeat", 429, null).retryAfterMs).toBeNull();
  });
});

describe("isRetryableFeedError", () => {
  it("429 와 5xx 는 다시 시도한다", () => {
    expect(isRetryableFeedError(new FeedHttpError("x", 429, null))).toBe(true);
    expect(isRetryableFeedError(new FeedHttpError("x", 503, null))).toBe(true);
  });

  it("404·403 은 재시도하지 않는다 — 세 번 시도해도 같은 답이다", () => {
    expect(isRetryableFeedError(new FeedHttpError("x", 404, null))).toBe(false);
    expect(isRetryableFeedError(new FeedHttpError("x", 403, null))).toBe(false);
  });

  it("네트워크 계층 실패는 재시도한다", () => {
    expect(isRetryableFeedError(new TypeError("fetch failed"))).toBe(true);
  });
});

describe("withRetry — Retry-After 존중", () => {
  it("서버가 지시한 대기가 백오프보다 길면 그쪽을 따른다", async () => {
    vi.useFakeTimers();
    try {
      let attempts = 0;
      const promise = withRetry(async () => {
        attempts += 1;
        if (attempts === 1) throw new FeedHttpError("VentureBeat", 429, "10");
        return "ok";
      }, {
        baseDelayMs: 100,
        shouldRetry: isRetryableFeedError,
        retryAfterMs: (error) => (error instanceof FeedHttpError ? error.retryAfterMs : null),
      });
      // 백오프 100ms 로는 아직 재시도되지 않아야 한다(서버가 10초를 지시했다).
      await vi.advanceTimersByTimeAsync(500);
      expect(attempts).toBe(1);
      await vi.advanceTimersByTimeAsync(10_000);
      await expect(promise).resolves.toBe("ok");
      expect(attempts).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("지시된 대기가 상한을 넘으면 기다리지 않고 포기한다", async () => {
    let attempts = 0;
    await expect(withRetry(async () => {
      attempts += 1;
      throw new FeedHttpError("VentureBeat", 429, "3600");
    }, {
      baseDelayMs: 10,
      maxDelayMs: 60_000,
      shouldRetry: isRetryableFeedError,
      retryAfterMs: (error) => (error instanceof FeedHttpError ? error.retryAfterMs : null),
    })).rejects.toThrow(/429/u);
    expect(attempts).toBe(1);
  });

  it("영구 오류는 한 번만 시도한다", async () => {
    let attempts = 0;
    await expect(withRetry(async () => {
      attempts += 1;
      throw new FeedHttpError("VentureBeat", 404, null);
    }, { baseDelayMs: 1, shouldRetry: isRetryableFeedError })).rejects.toThrow(/404/u);
    expect(attempts).toBe(1);
  });
});

describe("shouldRetryStorageError — 상태코드 우선", () => {
  /** pipeline 과 같은 규칙. 2026-10-04 "Internal server error."(500)를 문구 판정이 놓쳤다. */
  it("문구에 숫자가 없어도 500 이면 재시도한다", async () => {
    const { CollectorStorageError, shouldRetryStorageError } = await import("./supabase-store");
    expect(shouldRetryStorageError(new CollectorStorageError("Internal server error.", "upsert_raw_items", 500))).toBe(true);
    expect(shouldRetryStorageError(new CollectorStorageError("timeout", "upsert_raw_items", 409))).toBe(false);
    expect(shouldRetryStorageError(new CollectorStorageError("TypeError: fetch failed", "upsert_raw_items"))).toBe(true);
  });
});

describe("NEWS_FEEDS", () => {
  /** 9월 중순부터 전 클라이언트에 429, 미러는 9/3 에서 멈춘 캐시라 뺐다(rss.ts 주석 참고). */
  it("막힌 VentureBeat 피드를 포함하지 않는다", async () => {
    const { NEWS_FEEDS } = await import("./rss");
    expect(NEWS_FEEDS.some((feed) => feed.source === "VentureBeat")).toBe(false);
    expect(NEWS_FEEDS.length).toBeGreaterThanOrEqual(5);
  });
});
