import { z } from "zod";
import { LlmProviderError } from "./provider";

export const CATEGORY_CLASSIFY_PROMPT_VERSION = "category-classify-v1";

// 고정 분류 체계(DB categories 시드와 동일한 16개 슬러그). 분류기는 이 중 하나만 반환한다.
export const CATEGORY_TAXONOMY: { slug: string; label: string }[] = [
  { slug: "ai-agents", label: "AI 에이전트" },
  { slug: "coding", label: "개발·코딩" },
  { slug: "image", label: "이미지" },
  { slug: "video", label: "영상" },
  { slug: "audio-music", label: "음성·음악" },
  { slug: "document-rag", label: "문서·RAG" },
  { slug: "productivity", label: "생산성" },
  { slug: "data", label: "데이터 분석" },
  { slug: "design", label: "디자인" },
  { slug: "marketing", label: "마케팅" },
  { slug: "education", label: "교육" },
  { slug: "open-models", label: "오픈소스 모델" },
  { slug: "automation", label: "자동화" },
  { slug: "no-code", label: "노코드" },
  { slug: "infrastructure-api", label: "AI 인프라·API" },
  { slug: "other", label: "기타" },
];

export const CATEGORY_SLUGS = CATEGORY_TAXONOMY.map((c) => c.slug) as [string, ...string[]];

export const categoryInputSchema = z.object({
  index: z.number().int().nonnegative(),
  name: z.string(),
  description: z.string(),
});
export type CategoryInput = z.infer<typeof categoryInputSchema>;

export type CategoryOption = { slug: string; label: string };

export const categoryItemSchema = z.object({
  index: z.number().int().nonnegative(),
  categorySlug: z.string().min(1),
});
export type CategoryItem = z.infer<typeof categoryItemSchema>;

const categoryOutputSchema = z.object({ items: z.array(categoryItemSchema) });

// 허용 slug 집합으로 responseJsonSchema enum을 런타임에 만든다.
// taxonomy를 DB에서 주입할 수 있어(관리자가 승인한 신규 카테고리) 재배포 없이 확장된다.
function buildCategoryJsonSchema(taxonomy: CategoryOption[]) {
  return {
    type: "object",
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            index: { type: "integer" },
            categorySlug: { type: "string", enum: taxonomy.map((c) => c.slug) },
          },
          required: ["index", "categorySlug"],
        },
      },
    },
    required: ["items"],
  } as const;
}

function buildCategoryPrompt(items: CategoryInput[], taxonomy: CategoryOption[]): string {
  const list = items.map((item) => `[${item.index}] ${item.name}\n설명: ${item.description}`).join("\n\n");
  return [
    "다음 AI 서비스 각각을 아래 고정 분류 중 정확히 하나로 분류하세요.",
    "서비스의 실제 핵심 기능을 기준으로 판단하고, 설명에 우연히 등장한 단어에 휘둘리지 마세요.",
    "명확히 들어맞는 분류가 없을 때만 other(기타)를 사용하세요. 반드시 아래 slug 값 그대로 반환하세요.",
    "",
    "분류 목록:",
    taxonomy.map((c) => `- ${c.slug}: ${c.label}`).join("\n"),
    "",
    "서비스 목록:",
    list,
    "",
    "입력의 index를 그대로 사용해 모든 항목을 반환하세요.",
  ].join("\n");
}

const geminiResponseSchema = z.object({
  candidates: z.array(z.object({
    content: z.object({ parts: z.array(z.object({ text: z.string().optional() })) }).optional(),
  })).optional(),
  promptFeedback: z.object({ blockReason: z.string().optional() }).optional(),
});
const geminiErrorSchema = z.object({ error: z.object({ message: z.string().optional() }).optional() });

export interface CategoryClassifierConfig {
  apiKey: string;
  model?: string;
  endpoint?: string;
  timeoutMs?: number;
  batchSize?: number;
  fetchImpl?: typeof fetch;
}

export class GeminiCategoryClassifier {
  readonly provider = "google-gemini";
  readonly model: string;
  readonly batchSize: number;
  private readonly apiKey: string;
  private readonly endpoint: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(config: CategoryClassifierConfig) {
    if (!config.apiKey.trim()) throw new LlmProviderError("GEMINI_API_KEY가 설정되지 않았습니다.", "CONFIG", false);
    this.apiKey = config.apiKey;
    this.model = config.model ?? "gemini-3.1-flash-lite";
    this.endpoint = config.endpoint ?? "https://generativelanguage.googleapis.com/v1beta";
    this.timeoutMs = config.timeoutMs ?? 45_000;
    this.batchSize = config.batchSize ?? 40;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  // 여러 서비스를 batchSize 단위로 묶어 최소 호출 수로 분류한다(엔티티당 1콜 금지).
  // taxonomy 미지정 시 기본 16개를 쓰고, DB에서 주입하면 승인된 신규 카테고리까지 포함해 분류한다.
  async classify(rawItems: CategoryInput[], options?: { signal?: AbortSignal; taxonomy?: CategoryOption[] }): Promise<CategoryItem[]> {
    const items = z.array(categoryInputSchema).parse(rawItems);
    if (items.length === 0) return [];
    const taxonomy = options?.taxonomy?.length ? options.taxonomy : CATEGORY_TAXONOMY;
    const allowed = new Set(taxonomy.map((c) => c.slug));
    const results: CategoryItem[] = [];
    for (let start = 0; start < items.length; start += this.batchSize) {
      const batch = items.slice(start, start + this.batchSize);
      const batchResults = await this.classifyBatch(batch, taxonomy, options);
      // 허용 목록에 없는 slug(모델 일탈)는 버린다. 호출부는 category_id 해석 실패로 무시하지만 여기서 선제 방어.
      results.push(...batchResults.filter((item) => allowed.has(item.categorySlug)));
    }
    return results;
  }

  private async classifyBatch(items: CategoryInput[], taxonomy: CategoryOption[], options?: { signal?: AbortSignal }): Promise<CategoryItem[]> {
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
            systemInstruction: { parts: [{ text: "당신은 AI 서비스를 정해진 분류 체계로 정확히 분류하는 분류기입니다." }] },
            contents: [{ role: "user", parts: [{ text: buildCategoryPrompt(items, taxonomy) }] }],
            generationConfig: { temperature: 0, maxOutputTokens: 8_192, responseMimeType: "application/json", responseJsonSchema: buildCategoryJsonSchema(taxonomy) },
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
      const text = parsedResponse.data.candidates?.[0]?.content?.parts.map((part) => part.text ?? "").join("").trim();
      if (!text) {
        const blocked = parsedResponse.data.promptFeedback?.blockReason;
        throw new LlmProviderError(blocked ? `Gemini가 요청을 차단했습니다: ${blocked}` : "Gemini가 결과를 반환하지 않았습니다.", "INVALID_OUTPUT", false);
      }
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        throw new LlmProviderError("Gemini 결과가 JSON이 아닙니다.", "INVALID_OUTPUT", false);
      }
      const parsed = categoryOutputSchema.safeParse(json);
      if (!parsed.success) throw new LlmProviderError("Gemini 결과가 분류 스키마를 통과하지 못했습니다.", "INVALID_OUTPUT", false);
      return parsed.data.items;
    } catch (error) {
      if (error instanceof LlmProviderError) throw error;
      if (error instanceof Error && error.name === "AbortError") throw new LlmProviderError("Gemini API 요청 시간이 초과됐습니다.", "UPSTREAM", true);
      throw new LlmProviderError("Gemini API 연결에 실패했습니다.", "UPSTREAM", true);
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

export function createCategoryClassifierFromEnv(env: NodeJS.ProcessEnv = process.env) {
  return new GeminiCategoryClassifier({
    apiKey: env.GEMINI_API_KEY ?? "",
    ...(env.GEMINI_MODEL ? { model: env.GEMINI_MODEL } : {}),
  });
}
