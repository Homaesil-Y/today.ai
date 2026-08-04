import { describe, expect, it } from "vitest";
import { sanitizeModelForProvider } from "./model-defaults";

describe("sanitizeModelForProvider", () => {
  it("clears a model name that belongs to a different provider", () => {
    // 이 조합이 실제로 한 번 저장됐다: provider=groq인데 model이 Gemini 모델명으로 남아있었다.
    expect(sanitizeModelForProvider("groq", "gemini-3.1-flash-lite")).toBe("");
    expect(sanitizeModelForProvider("gemini", "openai/gpt-oss-20b")).toBe("");
  });

  it("keeps a custom model name the admin actually typed", () => {
    expect(sanitizeModelForProvider("groq", "openai/gpt-oss-120b")).toBe("openai/gpt-oss-120b");
    expect(sanitizeModelForProvider("gemini", "gemini-3.1-pro")).toBe("gemini-3.1-pro");
  });

  it("keeps an empty string empty", () => {
    expect(sanitizeModelForProvider("groq", "")).toBe("");
  });

  it("keeps a provider's own default when explicitly submitted", () => {
    expect(sanitizeModelForProvider("groq", "openai/gpt-oss-20b")).toBe("openai/gpt-oss-20b");
    expect(sanitizeModelForProvider("gemini", "gemini-3.1-flash-lite")).toBe("gemini-3.1-flash-lite");
  });
});
