import type { TrendAnalysis, TrendEvidence } from "./schema";

export interface LlmUsage {
  promptTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
}

export interface TrendAnalysisResult {
  analysis: TrendAnalysis;
  provider: string;
  model: string;
  promptVersion: string;
  generatedAt: string;
  usage: LlmUsage;
}

export interface TrendAnalysisProvider {
  readonly provider: string;
  readonly model: string;
  analyze(input: TrendEvidence, options?: { signal?: AbortSignal }): Promise<TrendAnalysisResult>;
}

export class LlmProviderError extends Error {
  constructor(
    message: string,
    readonly code: "CONFIG" | "AUTH" | "RATE_LIMIT" | "UPSTREAM" | "INVALID_OUTPUT",
    readonly retryable: boolean,
    readonly status?: number,
    /** 한도 해제까지 기다려야 하는 시간(ms). 서버가 알려준 경우에만 채워진다. */
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "LlmProviderError";
  }
}

/**
 * 429 응답에서 "얼마나 기다려야 하는지"를 뽑는다. 표준 retry-after 헤더를 먼저 보고,
 * 없으면 본문 메시지에 적힌 초 단위 안내를 읽는다.
 * (Groq: "Please try again in 20.79s", Gemini: "Please retry in 58.80126816s")
 */
export function parseRetryAfterMs(headers: Headers, message: string): number | undefined {
  const header = headers.get("retry-after");
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1_000);
  }
  const match = /(?:try again|retry) in ([\d.]+)s/iu.exec(message);
  if (match?.[1]) {
    const seconds = Number(match[1]);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1_000);
  }
  return undefined;
}
