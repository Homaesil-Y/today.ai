import { createGeminiProviderFromEnv, createGroqProviderFromEnv } from "@ai-trend-radar/llm";
import { z } from "zod";
import type { SupabasePipelineRepository } from "./repository";

/** 관리자 설정 페이지가 이 키로 app_settings에 쓴다. */
export const TREND_ANALYSIS_LLM_SETTING_KEY = "trend_analysis_llm";

// 어떤 값이 와도(마이그레이션 전 null, 손상된 값 등) 절대 throw하지 않고 Gemini로 대체한다.
const settingSchema = z
  .object({
    provider: z.enum(["gemini", "groq"]).catch("gemini"),
    model: z.string().trim().min(1).nullable().optional().catch(null),
  })
  .catch({ provider: "gemini", model: null });

/**
 * app_settings에 관리자가 지정한 프로바이더로 트렌드 분석 제공자를 만든다. API 키는 항상
 * 서버 환경변수(GitHub Secrets)에서만 읽는다 — 설정 테이블에는 "어느 프로바이더를 쓸지"만 있고
 * 키는 없다. 설정을 못 읽거나 값이 비어 있으면 지금까지 기본값이었던 Gemini로 동작한다.
 */
export async function createTrendAnalysisProviderFromSettings(
  env: NodeJS.ProcessEnv,
  repository: SupabasePipelineRepository,
) {
  const raw = await repository.loadAppSetting(TREND_ANALYSIS_LLM_SETTING_KEY);
  const setting = settingSchema.parse(raw);

  if (setting.provider === "groq") {
    return createGroqProviderFromEnv({ ...env, ...(setting.model ? { GROQ_MODEL: setting.model } : {}) });
  }
  return createGeminiProviderFromEnv({ ...env, ...(setting.model ? { GEMINI_MODEL: setting.model } : {}) });
}
