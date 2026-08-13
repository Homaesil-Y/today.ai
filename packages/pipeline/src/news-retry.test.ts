import { LlmProviderError } from "@ai-trend-radar/llm";
import { withRetry } from "@ai-trend-radar/collectors";
import { describe, expect, it } from "vitest";

/**
 * 뉴스 요약 재시도 규칙 회귀 테스트.
 *
 * 실제 장애(2026-08-13): 30건을 한 번에 요약하는 Gemini 호출이 45초 한도에 걸려
 * LlmProviderError(UPSTREAM, retryable: true)를 던졌고, 재시도하는 곳이 없어 수집한 뉴스를
 * 통째로 버리고 워크플로가 실패했다.
 */
const shouldRetry = (error: unknown) => !(error instanceof LlmProviderError) || error.retryable;

describe("news summary retry policy", () => {
  it("retries a timeout and succeeds on a later attempt", async () => {
    let calls = 0;
    const result = await withRetry(async () => {
      calls += 1;
      if (calls < 3) throw new LlmProviderError("Gemini API 요청 시간이 초과됐습니다.", "UPSTREAM", true);
      return ["ok"];
    }, { attempts: 3, baseDelayMs: 1, shouldRetry });

    expect(result).toEqual(["ok"]);
    expect(calls).toBe(3);
  });

  it("gives up immediately on a non-retryable error", async () => {
    // 키 누락처럼 결과가 바뀌지 않는 오류를 세 번 기다릴 이유가 없다.
    let calls = 0;
    await expect(withRetry(async () => {
      calls += 1;
      throw new LlmProviderError("GEMINI_API_KEY가 설정되지 않았습니다.", "CONFIG", false);
    }, { attempts: 3, baseDelayMs: 1, shouldRetry })).rejects.toThrow("GEMINI_API_KEY");

    expect(calls).toBe(1);
  });

  it("surfaces the failure after exhausting retryable attempts", async () => {
    let calls = 0;
    await expect(withRetry(async () => {
      calls += 1;
      throw new LlmProviderError("Gemini API 요청 시간이 초과됐습니다.", "UPSTREAM", true);
    }, { attempts: 3, baseDelayMs: 1, shouldRetry })).rejects.toThrow("시간이 초과");

    expect(calls).toBe(3);
  });

  it("retries an unknown error since it may be transient", async () => {
    let calls = 0;
    const result = await withRetry(async () => {
      calls += 1;
      if (calls === 1) throw new Error("socket hang up");
      return "ok";
    }, { attempts: 2, baseDelayMs: 1, shouldRetry });

    expect(result).toBe("ok");
    expect(calls).toBe(2);
  });
});
