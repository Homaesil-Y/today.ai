import { z } from "zod";
import { buildTrendAnalysisPrompt, TREND_ANALYSIS_PROMPT_VERSION } from "./prompt";
import { LlmProviderError, parseRetryAfterMs, type TrendAnalysisProvider } from "./provider";
import {
  trendAnalysisJsonSchema,
  trendAnalysisSchema,
  trendEvidenceSchema,
  type TrendEvidence,
} from "./schema";

const geminiResponseSchema = z.object({
  candidates: z.array(z.object({
    content: z.object({
      parts: z.array(z.object({ text: z.string().optional() })),
    }).optional(),
    finishReason: z.string().optional(),
  })).optional(),
  promptFeedback: z.object({ blockReason: z.string().optional() }).optional(),
  modelVersion: z.string().optional(),
  usageMetadata: z.object({
    promptTokenCount: z.number().optional(),
    candidatesTokenCount: z.number().optional(),
    totalTokenCount: z.number().optional(),
  }).optional(),
});

const geminiErrorSchema = z.object({
  error: z.object({ message: z.string().optional() }).optional(),
});

export interface GeminiProviderConfig {
  apiKey: string;
  model?: string;
  endpoint?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

export class GeminiTrendAnalysisProvider implements TrendAnalysisProvider {
  readonly provider = "google-gemini";
  readonly model: string;
  private readonly apiKey: string;
  private readonly endpoint: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;

  constructor(config: GeminiProviderConfig) {
    if (!config.apiKey.trim()) {
      throw new LlmProviderError("GEMINI_API_KEY가 설정되지 않았습니다.", "CONFIG", false);
    }
    this.apiKey = config.apiKey;
    this.model = config.model ?? "gemini-3.1-flash-lite";
    this.endpoint = config.endpoint ?? "https://generativelanguage.googleapis.com/v1beta";
    this.timeoutMs = config.timeoutMs ?? 30_000;
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.now = config.now ?? (() => new Date());
  }

  async analyze(rawInput: TrendEvidence, options?: { signal?: AbortSignal }) {
    const input = trendEvidenceSchema.parse(rawInput);
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), this.timeoutMs);
    const signal = options?.signal
      ? AbortSignal.any([options.signal, timeoutController.signal])
      : timeoutController.signal;

    try {
      const response = await this.fetchImpl(
        `${this.endpoint}/models/${encodeURIComponent(this.model)}:generateContent`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-goog-api-key": this.apiKey,
          },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: "당신은 출처 기반 AI 서비스 트렌드 분석가입니다." }],
            },
            contents: [{ role: "user", parts: [{ text: buildTrendAnalysisPrompt(input) }] }],
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 2_048,
              responseMimeType: "application/json",
              responseJsonSchema: trendAnalysisJsonSchema,
            },
          }),
          signal,
        },
      );

      const payload: unknown = await response.json();
      if (!response.ok) {
        const parsedError = geminiErrorSchema.safeParse(payload);
        const message = parsedError.success
          ? parsedError.data.error?.message ?? "Gemini API 요청에 실패했습니다."
          : "Gemini API 요청에 실패했습니다.";
        const code = response.status === 401 || response.status === 403
          ? "AUTH"
          : response.status === 429
            ? "RATE_LIMIT"
            : "UPSTREAM";
        throw new LlmProviderError(
          message,
          code,
          response.status === 429 || response.status >= 500,
          response.status,
          response.status === 429 ? parseRetryAfterMs(response.headers, message) : undefined,
        );
      }

      const parsedResponse = geminiResponseSchema.safeParse(payload);
      if (!parsedResponse.success) {
        throw new LlmProviderError("Gemini 응답 형식이 올바르지 않습니다.", "INVALID_OUTPUT", false);
      }

      const text = parsedResponse.data.candidates?.[0]?.content?.parts
        .map((part) => part.text ?? "")
        .join("")
        .trim();
      if (!text) {
        const blocked = parsedResponse.data.promptFeedback?.blockReason;
        throw new LlmProviderError(
          blocked ? `Gemini가 요청을 차단했습니다: ${blocked}` : "Gemini가 분석 결과를 반환하지 않았습니다.",
          "INVALID_OUTPUT",
          false,
        );
      }

      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        throw new LlmProviderError("Gemini 분석 결과가 JSON이 아닙니다.", "INVALID_OUTPUT", false);
      }
      const analysis = trendAnalysisSchema.safeParse(json);
      if (!analysis.success) {
        throw new LlmProviderError("Gemini 분석 결과가 서비스 스키마를 통과하지 못했습니다.", "INVALID_OUTPUT", false);
      }

      const usage = parsedResponse.data.usageMetadata;
      return {
        analysis: analysis.data,
        provider: this.provider,
        model: parsedResponse.data.modelVersion ?? this.model,
        promptVersion: TREND_ANALYSIS_PROMPT_VERSION,
        generatedAt: this.now().toISOString(),
        usage: {
          promptTokens: usage?.promptTokenCount ?? null,
          outputTokens: usage?.candidatesTokenCount ?? null,
          totalTokens: usage?.totalTokenCount ?? null,
        },
      };
    } catch (error) {
      if (error instanceof LlmProviderError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new LlmProviderError("Gemini API 요청 시간이 초과됐습니다.", "UPSTREAM", true);
      }
      throw new LlmProviderError("Gemini API 연결에 실패했습니다.", "UPSTREAM", true);
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

export function createGeminiProviderFromEnv(env: NodeJS.ProcessEnv = process.env) {
  return new GeminiTrendAnalysisProvider({
    apiKey: env.GEMINI_API_KEY ?? "",
    ...(env.GEMINI_MODEL ? { model: env.GEMINI_MODEL } : {}),
  });
}
