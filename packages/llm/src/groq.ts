import { z } from "zod";
import { buildTrendAnalysisPrompt, TREND_ANALYSIS_PROMPT_VERSION } from "./prompt";
import { LlmProviderError, parseRetryAfterMs, type TrendAnalysisProvider } from "./provider";
import {
  trendAnalysisJsonSchema,
  trendAnalysisSchema,
  trendEvidenceSchema,
  type TrendEvidence,
} from "./schema";

// OpenAI 호환 chat completions 응답 형태. Groq는 이 형태를 그대로 따른다.
const groqResponseSchema = z.object({
  model: z.string().optional(),
  choices: z.array(z.object({
    message: z.object({ content: z.string().nullable().optional() }).optional(),
    finish_reason: z.string().optional(),
  })).optional(),
  usage: z.object({
    prompt_tokens: z.number().optional(),
    completion_tokens: z.number().optional(),
    total_tokens: z.number().optional(),
  }).optional(),
});

const groqErrorSchema = z.object({
  error: z.object({ message: z.string().optional(), type: z.string().optional() }).optional(),
});

export interface GroqProviderConfig {
  apiKey: string;
  model?: string;
  endpoint?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

export class GroqTrendAnalysisProvider implements TrendAnalysisProvider {
  readonly provider = "groq";
  readonly model: string;
  private readonly apiKey: string;
  private readonly endpoint: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;

  constructor(config: GroqProviderConfig) {
    if (!config.apiKey.trim()) {
      throw new LlmProviderError("GROQ_API_KEY가 설정되지 않았습니다.", "CONFIG", false);
    }
    this.apiKey = config.apiKey;
    // strict json_schema(스키마 강제) 구조화 출력은 현재 openai/gpt-oss 계열에서만 보장된다.
    // 다른 모델은 best-effort json_object 모드라 enum·필수 필드가 어긋날 수 있어 기본값에서 뺐다.
    this.model = config.model ?? "openai/gpt-oss-20b";
    this.endpoint = config.endpoint ?? "https://api.groq.com/openai/v1";
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
      const response = await this.fetchImpl(`${this.endpoint}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          temperature: 0.2,
          max_tokens: 2_048,
          messages: [
            { role: "system", content: "당신은 출처 기반 AI 서비스 트렌드 분석가입니다." },
            { role: "user", content: buildTrendAnalysisPrompt(input) },
          ],
          response_format: {
            type: "json_schema",
            json_schema: { name: "trend_analysis", strict: true, schema: trendAnalysisJsonSchema },
          },
        }),
        signal,
      });

      const payload: unknown = await response.json();
      if (!response.ok) {
        const parsedError = groqErrorSchema.safeParse(payload);
        const message = parsedError.success
          ? parsedError.data.error?.message ?? "Groq API 요청에 실패했습니다."
          : "Groq API 요청에 실패했습니다.";
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

      const parsedResponse = groqResponseSchema.safeParse(payload);
      if (!parsedResponse.success) {
        throw new LlmProviderError("Groq 응답 형식이 올바르지 않습니다.", "INVALID_OUTPUT", false);
      }

      const text = parsedResponse.data.choices?.[0]?.message?.content?.trim();
      if (!text) {
        throw new LlmProviderError("Groq가 분석 결과를 반환하지 않았습니다.", "INVALID_OUTPUT", false);
      }

      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        throw new LlmProviderError("Groq 분석 결과가 JSON이 아닙니다.", "INVALID_OUTPUT", false);
      }
      const analysis = trendAnalysisSchema.safeParse(json);
      if (!analysis.success) {
        throw new LlmProviderError("Groq 분석 결과가 서비스 스키마를 통과하지 못했습니다.", "INVALID_OUTPUT", false);
      }

      const usage = parsedResponse.data.usage;
      return {
        analysis: analysis.data,
        provider: this.provider,
        model: parsedResponse.data.model ?? this.model,
        promptVersion: TREND_ANALYSIS_PROMPT_VERSION,
        generatedAt: this.now().toISOString(),
        usage: {
          promptTokens: usage?.prompt_tokens ?? null,
          outputTokens: usage?.completion_tokens ?? null,
          totalTokens: usage?.total_tokens ?? null,
        },
      };
    } catch (error) {
      if (error instanceof LlmProviderError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new LlmProviderError("Groq API 요청 시간이 초과됐습니다.", "UPSTREAM", true);
      }
      throw new LlmProviderError("Groq API 연결에 실패했습니다.", "UPSTREAM", true);
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

export function createGroqProviderFromEnv(env: NodeJS.ProcessEnv = process.env) {
  return new GroqTrendAnalysisProvider({
    apiKey: env.GROQ_API_KEY ?? "",
    ...(env.GROQ_MODEL ? { model: env.GROQ_MODEL } : {}),
  });
}
