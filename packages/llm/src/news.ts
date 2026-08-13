import { z } from "zod";
import { LlmProviderError } from "./provider";

export const NEWS_SUMMARY_PROMPT_VERSION = "news-summary-v1";

export const newsSummaryInputSchema = z.object({
  index: z.number().int().nonnegative(),
  source: z.string(),
  title: z.string(),
  snippet: z.string(),
});
export type NewsSummaryInput = z.infer<typeof newsSummaryInputSchema>;

export const newsSummaryItemSchema = z.object({
  index: z.number().int().nonnegative(),
  koTitle: z.string().min(1).max(120),
  koSummary: z.string().min(1).max(400),
});
export type NewsSummaryItem = z.infer<typeof newsSummaryItemSchema>;

const newsSummaryOutputSchema = z.object({ items: z.array(newsSummaryItemSchema) });

// Gemini responseJsonSchema에 넘길 손수 작성한 JSON 스키마(런타임 Zod와 별개).
const newsSummaryJsonSchema = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          index: { type: "integer" },
          koTitle: { type: "string" },
          koSummary: { type: "string" },
        },
        required: ["index", "koTitle", "koSummary"],
      },
    },
  },
  required: ["items"],
} as const;

function buildNewsPrompt(items: NewsSummaryInput[]): string {
  const list = items
    .map((item) => `[${item.index}] (출처: ${item.source})\n원문 제목: ${item.title}\n원문 내용: ${item.snippet}`)
    .join("\n\n");
  return [
    "다음 영문 AI 뉴스 각각을 한국어로 정리하세요. 각 항목에 대해:",
    "- koTitle: 제목을 자연스러운 한국어로 번역·재작성 (60자 이내, 낚시성 표현 금지, 사실만).",
    "- koSummary: 핵심을 한 문장으로 요약 (100자 이내). 원문에 없는 사실을 절대 추가하지 마세요.",
    "이모지·해시태그·마크다운·따옴표 장식을 쓰지 마세요. 입력의 index를 그대로 사용해 모든 항목을 반환하세요.",
    "",
    list,
  ].join("\n");
}

const geminiResponseSchema = z.object({
  candidates: z.array(z.object({
    content: z.object({ parts: z.array(z.object({ text: z.string().optional() })) }).optional(),
  })).optional(),
  promptFeedback: z.object({ blockReason: z.string().optional() }).optional(),
  modelVersion: z.string().optional(),
});
const geminiErrorSchema = z.object({ error: z.object({ message: z.string().optional() }).optional() });

export interface NewsSummarizerConfig {
  apiKey: string;
  model?: string;
  endpoint?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export class GeminiNewsSummarizer {
  readonly provider = "google-gemini";
  readonly model: string;
  private readonly apiKey: string;
  private readonly endpoint: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(config: NewsSummarizerConfig) {
    if (!config.apiKey.trim()) {
      throw new LlmProviderError("GEMINI_API_KEY가 설정되지 않았습니다.", "CONFIG", false);
    }
    this.apiKey = config.apiKey;
    this.model = config.model ?? "gemini-3.1-flash-lite";
    this.endpoint = config.endpoint ?? "https://generativelanguage.googleapis.com/v1beta";
    // 최대 30건을 한 번에 요약하며 출력이 8,192 토큰까지 나오므로 45초로는 빡빡했다(실측
    // 2026-08-13: 정확히 45초 한도에 걸려 수집 워크플로가 실패). 잡 예산은 10분이라
    // 3회 재시도(news-runner)를 감안해도 90초씩은 충분히 들어간다.
    this.timeoutMs = config.timeoutMs ?? 90_000;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async summarize(rawItems: NewsSummaryInput[], options?: { signal?: AbortSignal }): Promise<NewsSummaryItem[]> {
    const items = z.array(newsSummaryInputSchema).parse(rawItems);
    if (items.length === 0) return [];

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
          headers: { "content-type": "application/json", "x-goog-api-key": this.apiKey },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: "당신은 영문 AI 뉴스를 한국어로 정확하게 옮기는 뉴스 에디터입니다." }] },
            contents: [{ role: "user", parts: [{ text: buildNewsPrompt(items) }] }],
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 8_192,
              responseMimeType: "application/json",
              responseJsonSchema: newsSummaryJsonSchema,
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
        throw new LlmProviderError(message, code, response.status === 429 || response.status >= 500, response.status);
      }

      const parsedResponse = geminiResponseSchema.safeParse(payload);
      if (!parsedResponse.success) {
        throw new LlmProviderError("Gemini 응답 형식이 올바르지 않습니다.", "INVALID_OUTPUT", false);
      }
      const text = parsedResponse.data.candidates?.[0]?.content?.parts.map((part) => part.text ?? "").join("").trim();
      if (!text) {
        const blocked = parsedResponse.data.promptFeedback?.blockReason;
        throw new LlmProviderError(
          blocked ? `Gemini가 요청을 차단했습니다: ${blocked}` : "Gemini가 결과를 반환하지 않았습니다.",
          "INVALID_OUTPUT",
          false,
        );
      }

      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        throw new LlmProviderError("Gemini 결과가 JSON이 아닙니다.", "INVALID_OUTPUT", false);
      }
      const parsed = newsSummaryOutputSchema.safeParse(json);
      if (!parsed.success) {
        throw new LlmProviderError("Gemini 결과가 뉴스 요약 스키마를 통과하지 못했습니다.", "INVALID_OUTPUT", false);
      }
      return parsed.data.items;
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

export function createNewsSummarizerFromEnv(env: NodeJS.ProcessEnv = process.env) {
  return new GeminiNewsSummarizer({
    apiKey: env.GEMINI_API_KEY ?? "",
    ...(env.GEMINI_MODEL ? { model: env.GEMINI_MODEL } : {}),
  });
}
