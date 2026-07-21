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
  ) {
    super(message);
    this.name = "LlmProviderError";
  }
}
