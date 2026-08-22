import { z } from "zod";
import { LlmProviderError } from "./provider";

export const NAME_EXTRACT_PROMPT_VERSION = "name-extract-v1";

export const nameInputSchema = z.object({
  index: z.number().int().nonnegative(),
  currentName: z.string(),
  description: z.string(),
  canonicalUrl: z.string(),
  githubUrl: z.string().nullable().optional(),
});
export type NameInput = z.infer<typeof nameInputSchema>;

export const nameItemSchema = z.object({
  index: z.number().int().nonnegative(),
  // 판별 불가일 때 모델이 빈 문자열을 반환할 수 있게 두고, 호출부에서 건너뛴다.
  name: z.string(),
});
export type NameItem = z.infer<typeof nameItemSchema>;

const nameOutputSchema = z.object({ items: z.array(nameItemSchema) });

const nameJsonSchema = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: { index: { type: "integer" }, name: { type: "string" } },
        required: ["index", "name"],
      },
    },
  },
  required: ["items"],
} as const;

function buildNamePrompt(items: NameInput[]): string {
  const list = items
    .map((item) =>
      [
        `[${item.index}]`,
        `현재 표기: ${item.currentName}`,
        `공식 URL: ${item.canonicalUrl}`,
        ...(item.githubUrl ? [`GitHub: ${item.githubUrl}`] : []),
        `설명: ${item.description}`,
      ].join("\n"),
    )
    .join("\n\n");
  return [
    "각 항목의 실제 제품·서비스 이름만 추출하세요.",
    "현재 표기는 커뮤니티 게시글 제목에서 기계적으로 잘라낸 값이라 제품명이 아닌 문장·설명인 경우가 많습니다.",
    "",
    "규칙:",
    "- 제작자가 공식적으로 쓰는 고유명사만 반환하고, 대소문자 표기도 공식 표기를 따르세요(예: MarbleOS).",
    "- 설명·기능 문구·의문문·마케팅 문장은 절대 이름에 포함하지 마세요.",
    // "Show HN: I built a Claude Code plugin to …" 처럼 제목이 문장이면, 문장 안에서 가장 눈에 띄는
    // 고유명사가 제품이 아니라 "쓰는 도구"인 경우가 많다. 실제로 이 제목에서 제품명을 fn2.ai(FN2)가
    // 아니라 "Claude Code"로 잘못 뽑았다.
    "- 그 제품이 단지 사용·연동·확장하는 제3자 도구/플랫폼/모델 이름(예: Claude Code, ChatGPT, Slack, Notion, Kubernetes)은 제품명이 아닙니다. 제목이 \"X를 위한 플러그인/확장/클론/대안\" 형태면 X를 반환하지 마세요.",
    "- 작성자·회사 대표의 사람 이름은 제품명이 아닙니다.",
    "- 문장형 제목에서 제품명을 못 찾으면, 공식 URL 도메인의 서비스명(예: fn2.ai → FN2)을 우선 사용하세요.",
    "- 제목에 제품명이 없으면 설명 본문이나 공식 URL 도메인, GitHub 저장소명에서 찾으세요.",
    "- 이름 뒤에 붙은 버전·태그·부제(\"v1.1 is out\", \"(Skill)\", \"- 설명\")는 제거하세요.",
    "- 현재 표기가 이미 올바른 제품명이면 그대로 반환하세요.",
    "- 어떤 근거로도 제품명을 특정할 수 없으면 빈 문자열을 반환하세요(추측해서 만들어내지 마세요).",
    "- 이름은 60자 이내, 보통 1~4개 단어입니다.",
    "",
    "항목:",
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

export interface NameExtractorConfig {
  apiKey: string;
  model?: string;
  endpoint?: string;
  timeoutMs?: number;
  batchSize?: number;
  fetchImpl?: typeof fetch;
}

export class GeminiNameExtractor {
  readonly provider = "google-gemini";
  readonly model: string;
  readonly batchSize: number;
  private readonly apiKey: string;
  private readonly endpoint: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(config: NameExtractorConfig) {
    if (!config.apiKey.trim()) throw new LlmProviderError("GEMINI_API_KEY가 설정되지 않았습니다.", "CONFIG", false);
    this.apiKey = config.apiKey;
    this.model = config.model ?? "gemini-3.1-flash-lite";
    this.endpoint = config.endpoint ?? "https://generativelanguage.googleapis.com/v1beta";
    this.timeoutMs = config.timeoutMs ?? 45_000;
    // 설명 본문까지 함께 보내므로 분류기(40)보다 작은 배치를 쓴다.
    this.batchSize = config.batchSize ?? 20;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async extract(rawItems: NameInput[], options?: { signal?: AbortSignal }): Promise<NameItem[]> {
    const items = z.array(nameInputSchema).parse(rawItems);
    if (items.length === 0) return [];
    const results: NameItem[] = [];
    for (let start = 0; start < items.length; start += this.batchSize) {
      const batch = await this.extractBatch(items.slice(start, start + this.batchSize), options);
      // 빈 문자열(판별 불가)과 지나치게 긴 값은 여기서 걸러 호출부가 그대로 쓸 수 있게 한다.
      results.push(...batch.filter((item) => item.name.trim().length > 0 && item.name.trim().length <= 60));
    }
    return results.map((item) => ({ index: item.index, name: item.name.trim() }));
  }

  private async extractBatch(items: NameInput[], options?: { signal?: AbortSignal }): Promise<NameItem[]> {
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
            systemInstruction: { parts: [{ text: "당신은 게시글 제목과 설명에서 제품의 공식 이름만 정확히 뽑아내는 추출기입니다." }] },
            contents: [{ role: "user", parts: [{ text: buildNamePrompt(items) }] }],
            generationConfig: { temperature: 0, maxOutputTokens: 8_192, responseMimeType: "application/json", responseJsonSchema: nameJsonSchema },
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
      const parsed = nameOutputSchema.safeParse(json);
      if (!parsed.success) throw new LlmProviderError("Gemini 결과가 이름 추출 스키마를 통과하지 못했습니다.", "INVALID_OUTPUT", false);
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

export function createNameExtractorFromEnv(env: NodeJS.ProcessEnv = process.env) {
  return new GeminiNameExtractor({
    apiKey: env.GEMINI_API_KEY ?? "",
    ...(env.GEMINI_MODEL ? { model: env.GEMINI_MODEL } : {}),
  });
}
