export const LLM_PROVIDERS = ["gemini", "groq"] as const;
export type LlmProvider = (typeof LLM_PROVIDERS)[number];

export const PROVIDER_LABELS: Record<LlmProvider, string> = { gemini: "Google Gemini", groq: "Groq" };
export const PROVIDER_DEFAULT_MODELS: Record<LlmProvider, string> = {
  gemini: "gemini-3.1-flash-lite",
  groq: "openai/gpt-oss-20b",
};

/**
 * 다른 프로바이더의 기본 모델명이 그대로 들어오면 비워서(→ 저장 시 null → 해당 프로바이더의
 * 기본 모델 사용) 실제로 존재하지 않는 조합이 저장되는 걸 막는다.
 * 예: provider=groq인데 model=gemini-3.1-flash-lite로 저장되면 다음 분석이 모델을 찾을 수 없어
 * 매번 실패한다 — 실제로 한 번 이렇게 저장된 적이 있다(라디오만 바꾸고 모델칸을 안 지운 경우).
 */
export function sanitizeModelForProvider(provider: LlmProvider, model: string): string {
  const otherDefaults = Object.entries(PROVIDER_DEFAULT_MODELS)
    .filter(([key]) => key !== provider)
    .map(([, value]) => value);
  return otherDefaults.includes(model.trim()) ? "" : model;
}
