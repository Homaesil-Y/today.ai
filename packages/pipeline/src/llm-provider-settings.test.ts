import { GeminiTrendAnalysisProvider, GroqTrendAnalysisProvider } from "@ai-trend-radar/llm";
import { describe, expect, it } from "vitest";
import { createTrendAnalysisProviderFromSettings } from "./llm-provider-settings";
import type { SupabasePipelineRepository } from "./repository";

function stubRepository(value: unknown): SupabasePipelineRepository {
  return { loadAppSetting: async () => value } as unknown as SupabasePipelineRepository;
}

const env = { GEMINI_API_KEY: "gemini-key", GROQ_API_KEY: "groq-key" };

describe("createTrendAnalysisProviderFromSettings", () => {
  it("builds Groq when the admin picked it", async () => {
    const provider = await createTrendAnalysisProviderFromSettings(env, stubRepository({ provider: "groq", model: null }));
    expect(provider).toBeInstanceOf(GroqTrendAnalysisProvider);
  });

  it("passes through a custom model when the admin set one", async () => {
    const provider = await createTrendAnalysisProviderFromSettings(
      env,
      stubRepository({ provider: "groq", model: "openai/gpt-oss-120b" }),
    );
    expect((provider as GroqTrendAnalysisProvider).model).toBe("openai/gpt-oss-120b");
  });

  it("defaults to Gemini when no setting row exists yet (pre-migration)", async () => {
    const provider = await createTrendAnalysisProviderFromSettings(env, stubRepository(null));
    expect(provider).toBeInstanceOf(GeminiTrendAnalysisProvider);
  });

  it("defaults to Gemini when the stored value is malformed", async () => {
    const provider = await createTrendAnalysisProviderFromSettings(env, stubRepository({ provider: "not-a-real-provider" }));
    expect(provider).toBeInstanceOf(GeminiTrendAnalysisProvider);
  });

  it("defaults to Gemini when the provider field is explicitly gemini", async () => {
    const provider = await createTrendAnalysisProviderFromSettings(env, stubRepository({ provider: "gemini", model: null }));
    expect(provider).toBeInstanceOf(GeminiTrendAnalysisProvider);
  });
});
