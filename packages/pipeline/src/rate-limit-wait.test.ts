import { describe, expect, it } from "vitest";
import { DEFAULT_MAX_TOTAL_WAIT_MS, planRateLimitWait } from "./rate-limit-wait";

describe("planRateLimitWait", () => {
  it("waits the time the provider asked for, plus a small margin", () => {
    // Groq 실제 응답: "Please try again in 20.79s" → 20790ms
    expect(planRateLimitWait({ retryAfterMs: 20_790, waitedMs: 0 })).toEqual({ waitMs: 21_790 });
  });

  it("gives up when the provider did not say how long to wait", () => {
    // 얼마나 기다려야 하는지 모르면 추측하지 않고 다음 주기에 맡긴다.
    expect(planRateLimitWait({ retryAfterMs: undefined, waitedMs: 0 })).toBeNull();
  });

  it("gives up when a single wait would be too long", () => {
    // 일일 한도 소진 같은 경우 안내 시간이 매우 길다 — 이번 실행에서 회복 불가로 본다.
    expect(planRateLimitWait({ retryAfterMs: 10 * 60_000, waitedMs: 0 })).toBeNull();
  });

  it("gives up once the run has spent its total wait budget", () => {
    // GitHub Actions 잡 타임아웃(15분)을 넘기지 않으려면 누적 대기에도 상한이 필요하다.
    expect(planRateLimitWait({ retryAfterMs: 20_000, waitedMs: DEFAULT_MAX_TOTAL_WAIT_MS })).toBeNull();
    expect(planRateLimitWait({ retryAfterMs: 20_000, waitedMs: DEFAULT_MAX_TOTAL_WAIT_MS - 5_000 })).toBeNull();
  });

  it("keeps waiting while budget remains", () => {
    expect(planRateLimitWait({ retryAfterMs: 20_000, waitedMs: 60_000 })).toEqual({ waitMs: 21_000 });
  });

  it("handles a zero-second hint without waiting negatively", () => {
    expect(planRateLimitWait({ retryAfterMs: 0, waitedMs: 0 })).toEqual({ waitMs: 1_000 });
  });

  it("respects caller-provided limits", () => {
    expect(planRateLimitWait({ retryAfterMs: 30_000, waitedMs: 0, maxSingleWaitMs: 10_000 })).toBeNull();
    expect(planRateLimitWait({ retryAfterMs: 5_000, waitedMs: 0, maxTotalWaitMs: 3_000 })).toBeNull();
  });
});
