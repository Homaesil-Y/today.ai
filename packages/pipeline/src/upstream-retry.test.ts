import { LlmProviderError } from "@ai-trend-radar/llm";
import { describe, expect, it } from "vitest";
import { ANALYSIS_MIN_INTERVAL_MS, planUpstreamRetry, UPSTREAM_RETRY_DELAY_MS } from "./runner";

/**
 * Gemini 는 503 "This model is currently experiencing high demand" 와 요청 타임아웃에
 * LlmProviderError(code "UPSTREAM", retryable true) 를 던진다. runner 는 RATE_LIMIT 만 재시도하고
 * 이 플래그를 한 번도 보지 않아, 2026-10-03~04 분석 실행에서 50건 중 5~21건이 그냥 버려졌다
 * (analysisErrors 로 삼켜져 실행 결론은 success).
 */
const plenty = 10 * 60_000;
const upstream = (retryable: boolean) => new LlmProviderError("This model is currently experiencing high demand.", "UPSTREAM", retryable, 503);

describe("planUpstreamRetry", () => {
  it("재시도 가능한 UPSTREAM 오류는 한 번 다시 시도한다", () => {
    expect(planUpstreamRetry({ error: upstream(true), alreadyRetried: false, remainingMs: plenty })).toBe(true);
  });

  it("타임아웃도 같은 경로로 재시도한다", () => {
    const timeout = new LlmProviderError("Gemini API 요청 시간이 초과됐습니다.", "UPSTREAM", true);
    expect(planUpstreamRetry({ error: timeout, alreadyRetried: false, remainingMs: plenty })).toBe(true);
  });

  /** 모델이 계속 과부하면 같은 후보에 예산을 다 쓰지 않고 다음으로 넘어가야 한다. */
  it("후보당 한 번만 재시도한다", () => {
    expect(planUpstreamRetry({ error: upstream(true), alreadyRetried: true, remainingMs: plenty })).toBe(false);
  });

  it("공급자가 재시도 불가로 표시하면 따른다", () => {
    expect(planUpstreamRetry({ error: upstream(false), alreadyRetried: false, remainingMs: plenty })).toBe(false);
  });

  it.each(["RATE_LIMIT", "AUTH", "CONFIG", "INVALID_OUTPUT"] as const)("%s 는 이 경로로 재시도하지 않는다", (code) => {
    const error = new LlmProviderError("x", code, true);
    expect(planUpstreamRetry({ error, alreadyRetried: false, remainingMs: plenty })).toBe(false);
  });

  it("대기 후 예산이 남지 않으면 재시도하지 않는다", () => {
    const tight = UPSTREAM_RETRY_DELAY_MS + ANALYSIS_MIN_INTERVAL_MS;
    expect(planUpstreamRetry({ error: upstream(true), alreadyRetried: false, remainingMs: tight })).toBe(false);
    expect(planUpstreamRetry({ error: upstream(true), alreadyRetried: false, remainingMs: tight + 1 })).toBe(true);
  });

  it("LlmProviderError 가 아니면 재시도하지 않는다", () => {
    expect(planUpstreamRetry({ error: new Error("boom"), alreadyRetried: false, remainingMs: plenty })).toBe(false);
  });
});
