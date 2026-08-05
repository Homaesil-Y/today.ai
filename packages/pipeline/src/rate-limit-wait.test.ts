import { describe, expect, it } from "vitest";
import { planRateLimitWait } from "./rate-limit-wait";

describe("planRateLimitWait", () => {
  it("waits the time the provider asked for, plus a small margin", () => {
    // Groq 실제 응답: "Please try again in 20.79s" → 20790ms
    expect(planRateLimitWait({ retryAfterMs: 20_790, remainingMs: 5 * 60_000 })).toEqual({ waitMs: 21_790 });
  });

  it("gives up when the provider did not say how long to wait", () => {
    // 얼마나 기다려야 하는지 모르면 추측하지 않고 다음 주기에 맡긴다.
    expect(planRateLimitWait({ retryAfterMs: undefined, remainingMs: 5 * 60_000 })).toBeNull();
  });

  it("gives up when a single wait would be too long", () => {
    // 일일 한도 소진 같은 경우 안내 시간이 매우 길다 — 이번 실행에서 회복 불가로 본다.
    expect(planRateLimitWait({ retryAfterMs: 10 * 60_000, remainingMs: 20 * 60_000 })).toBeNull();
  });

  it("stops instead of waiting past the deadline", () => {
    // 이 상한이 없으면 잡 타임아웃에 걸려 자동 승인이 실행되지 않는다(실제로 분석 22건이 그렇게 묻혔다).
    expect(planRateLimitWait({ retryAfterMs: 20_000, remainingMs: 21_000 })).toBeNull();
    expect(planRateLimitWait({ retryAfterMs: 20_000, remainingMs: 10_000 })).toBeNull();
    expect(planRateLimitWait({ retryAfterMs: 20_000, remainingMs: 0 })).toBeNull();
  });

  it("keeps waiting while the deadline is far enough away", () => {
    expect(planRateLimitWait({ retryAfterMs: 20_000, remainingMs: 21_002 })).toEqual({ waitMs: 21_000 });
  });

  it("handles a zero-second hint without waiting negatively", () => {
    expect(planRateLimitWait({ retryAfterMs: 0, remainingMs: 60_000 })).toEqual({ waitMs: 1_000 });
  });

  it("respects a caller-provided single-wait limit", () => {
    expect(planRateLimitWait({ retryAfterMs: 30_000, remainingMs: 5 * 60_000, maxSingleWaitMs: 10_000 })).toBeNull();
  });
});
