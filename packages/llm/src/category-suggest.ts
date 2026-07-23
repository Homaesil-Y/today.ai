import { z } from "zod";
import type { CategoryOption } from "./category";
import { LlmProviderError } from "./provider";

export const CATEGORY_SUGGEST_PROMPT_VERSION = "category-suggest-v1";

export const suggestInputSchema = z.object({ name: z.string(), description: z.string() });
export type SuggestInput = z.infer<typeof suggestInputSchema>;

export const categorySuggestionSchema = z.object({
  slug: z.string().regex(/^[a-z][a-z0-9-]{1,38}$/u), // kebab-case 영문 슬러그
  label: z.string().min(1).max(24), // 한국어 표시 라벨
  rationale: z.string().min(1).max(200),
  exampleNames: z.array(z.string()).min(2).max(8),
});
export type CategorySuggestion = z.infer<typeof categorySuggestionSchema>;

const suggestOutputSchema = z.object({ suggestions: z.array(categorySuggestionSchema) });

const suggestJsonSchema = {
  type: "object",
  properties: {
    suggestions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          slug: { type: "string" },
          label: { type: "string" },
          rationale: { type: "string" },
          exampleNames: { type: "array", items: { type: "string" } },
        },
        required: ["slug", "label", "rationale", "exampleNames"],
      },
    },
  },
  required: ["suggestions"],
} as const;

function buildSuggestPrompt(items: SuggestInput[], existing: CategoryOption[], minCluster: number): string {
  const list = items.map((item, i) => `[${i}] ${item.name}\n설명: ${item.description}`).join("\n\n");
  return [
    "아래는 현재 분류가 '기타(other)'인 AI 서비스들입니다. 이들 사이에서 공통 주제를 이루는 묶음이 있는지 찾아,",
    "기존 분류 체계에 없는 '새 카테고리 후보'만 제안하세요. 억지로 만들지 말고, 명확한 묶음이 없으면 빈 배열을 반환하세요.",
    "",
    "규칙:",
    `- 각 후보는 최소 ${minCluster}개 이상의 서비스를 포괄해야 한다.`,
    "- 아래 '기존 분류'와 의미가 겹치는 후보는 제안하지 않는다.",
    "- slug: 영문 kebab-case(예: developer-tools). label: 짧은 한국어 이름. rationale: 왜 필요한지 한 문장.",
    "- exampleNames: 이 후보에 해당하는 서비스 이름 2~8개.",
    "",
    "기존 분류:",
    existing.map((c) => `- ${c.slug}: ${c.label}`).join("\n"),
    "",
    "기타로 분류된 서비스:",
    list,
  ].join("\n");
}

const geminiResponseSchema = z.object({
  candidates: z.array(z.object({ content: z.object({ parts: z.array(z.object({ text: z.string().optional() })) }).optional() })).optional(),
  promptFeedback: z.object({ blockReason: z.string().optional() }).optional(),
});
const geminiErrorSchema = z.object({ error: z.object({ message: z.string().optional() }).optional() });

export interface CategorySuggesterConfig {
  apiKey: string;
  model?: string;
  endpoint?: string;
  timeoutMs?: number;
  minCluster?: number;
  fetchImpl?: typeof fetch;
}

// '기타' 서비스 묶음에서 새 카테고리 후보를 제안한다(생성 아님 — 관리자 승인용 제안만).
export class GeminiCategorySuggester {
  readonly provider = "google-gemini";
  readonly model: string;
  readonly minCluster: number;
  private readonly apiKey: string;
  private readonly endpoint: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(config: CategorySuggesterConfig) {
    if (!config.apiKey.trim()) throw new LlmProviderError("GEMINI_API_KEY가 설정되지 않았습니다.", "CONFIG", false);
    this.apiKey = config.apiKey;
    this.model = config.model ?? "gemini-3.1-flash-lite";
    this.endpoint = config.endpoint ?? "https://generativelanguage.googleapis.com/v1beta";
    this.timeoutMs = config.timeoutMs ?? 45_000;
    this.minCluster = config.minCluster ?? 3;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  // 전체를 1콜로 분석한다(제안은 드물게, 하루 1회 정도 실행 상정).
  async suggest(rawItems: SuggestInput[], existing: CategoryOption[], options?: { signal?: AbortSignal }): Promise<CategorySuggestion[]> {
    const items = z.array(suggestInputSchema).parse(rawItems);
    if (items.length < this.minCluster) return [];
    const existingSlugs = new Set(existing.map((c) => c.slug));

    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), this.timeoutMs);
    const signal = options?.signal ? AbortSignal.any([options.signal, timeoutController.signal]) : timeoutController.signal;
    try {
      const response = await this.fetchImpl(
        `${this.endpoint}/models/${encodeURIComponent(this.model)}:generateContent`,
        {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": this.apiKey },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: "당신은 AI 서비스 분류 체계를 관리하는 큐레이터입니다. 꼭 필요한 신규 분류만 신중히 제안합니다." }] },
            contents: [{ role: "user", parts: [{ text: buildSuggestPrompt(items, existing, this.minCluster) }] }],
            generationConfig: { temperature: 0.2, maxOutputTokens: 4_096, responseMimeType: "application/json", responseJsonSchema: suggestJsonSchema },
          }),
          signal,
        },
      );
      const payload: unknown = await response.json();
      if (!response.ok) {
        const parsedError = geminiErrorSchema.safeParse(payload);
        const message = parsedError.success ? parsedError.data.error?.message ?? "Gemini API 요청에 실패했습니다." : "Gemini API 요청에 실패했습니다.";
        const code = response.status === 401 || response.status === 403 ? "AUTH" : response.status === 429 ? "RATE_LIMIT" : "UPSTREAM";
        throw new LlmProviderError(message, code, response.status === 429 || response.status >= 500, response.status);
      }
      const parsedResponse = geminiResponseSchema.safeParse(payload);
      if (!parsedResponse.success) throw new LlmProviderError("Gemini 응답 형식이 올바르지 않습니다.", "INVALID_OUTPUT", false);
      const text = parsedResponse.data.candidates?.[0]?.content?.parts.map((p) => p.text ?? "").join("").trim();
      if (!text) return [];
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        throw new LlmProviderError("Gemini 결과가 JSON이 아닙니다.", "INVALID_OUTPUT", false);
      }
      const parsed = suggestOutputSchema.safeParse(json);
      if (!parsed.success) return [];
      // 기존 분류와 겹치는 slug는 제외한다(중복 카테고리 방지).
      return parsed.data.suggestions.filter((s) => !existingSlugs.has(s.slug) && s.exampleNames.length >= this.minCluster);
    } catch (error) {
      if (error instanceof LlmProviderError) throw error;
      if (error instanceof Error && error.name === "AbortError") throw new LlmProviderError("Gemini API 요청 시간이 초과됐습니다.", "UPSTREAM", true);
      throw new LlmProviderError("Gemini API 연결에 실패했습니다.", "UPSTREAM", true);
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

export function createCategorySuggesterFromEnv(env: NodeJS.ProcessEnv = process.env) {
  return new GeminiCategorySuggester({
    apiKey: env.GEMINI_API_KEY ?? "",
    ...(env.GEMINI_MODEL ? { model: env.GEMINI_MODEL } : {}),
  });
}
