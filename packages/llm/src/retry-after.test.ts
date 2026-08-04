import { describe, expect, it } from "vitest";
import { parseRetryAfterMs } from "./provider";

const headers = (init: Record<string, string> = {}) => new Headers(init);

describe("parseRetryAfterMs", () => {
  it("prefers the standard retry-after header", () => {
    expect(parseRetryAfterMs(headers({ "retry-after": "30" }), "")).toBe(30_000);
  });

  it("reads Groq's message wording when there is no header", () => {
    // 실제 응답: "... Please try again in 20.79s. Need more tokens? ..."
    const message = "Rate limit reached for model `openai/gpt-oss-20b` ... Please try again in 20.79s. Need more tokens?";
    expect(parseRetryAfterMs(headers(), message)).toBe(20_790);
  });

  it("reads Gemini's message wording", () => {
    // 실제 응답: "... Please retry in 58.80126816s"
    expect(parseRetryAfterMs(headers(), "Quota exceeded ... Please retry in 58.80126816s")).toBe(58_801);
  });

  it("returns undefined when nothing indicates a wait time", () => {
    expect(parseRetryAfterMs(headers(), "Quota exceeded for metric foo")).toBeUndefined();
  });

  it("ignores an unparseable header and falls back to the message", () => {
    // HTTP는 날짜 형식 retry-after도 허용하지만 여기서는 초 단위만 다루고, 그 경우 메시지로 넘어간다.
    expect(parseRetryAfterMs(headers({ "retry-after": "Wed, 21 Oct 2026 07:28:00 GMT" }), "try again in 5s")).toBe(5_000);
  });
});
