import { describe, expect, it, vi } from "vitest";
import { GeminiTrendAnalysisProvider } from "./gemini";
import type { TrendEvidence } from "./schema";

const evidence: TrendEvidence = {
  name: "Browser Use",
  category: "AI 에이전트",
  canonicalUrl: "https://browser-use.com",
  observedAt: "2026-07-20T00:00:00.000Z",
  officialFacts: ["공식 GitHub 저장소가 공개되어 있다."],
  sources: [{
    source: "github",
    url: "https://github.com/browser-use/browser-use",
    title: "Browser Use repository",
    excerpt: "24시간 동안 스타가 1,420개 증가했다.",
    metrics: { starsDelta24h: 1420 },
  }],
};

const analysis = {
  summary: "브라우저 작업 자동화를 지원하는 오픈소스 AI 에이전트입니다.",
  whyTrending: ["GitHub 스타가 24시간 동안 빠르게 증가했습니다."],
  targetUsers: ["브라우저 반복 업무를 자동화하려는 개발자"],
  strengths: ["공식 저장소에서 소스 코드를 확인할 수 있습니다."],
  weaknesses: ["제공된 근거만으로 운영 안정성은 확인이 필요합니다."],
  pricingType: "open_source",
  useCases: ["반복 웹 작업 자동화"],
  benchmarkPoints: ["작업 실행 과정의 가시성"],
  koreaOpportunity: "국내 웹 업무 흐름에 맞춘 자동화 도구로 확장할 수 있습니다.",
  businessPotential: "HIGH",
  developmentDifficulty: "MEDIUM",
} as const;

describe("GeminiTrendAnalysisProvider", () => {
  it("validates structured output and returns metadata", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify(analysis) }] } }],
      modelVersion: "gemini-3.1-flash-lite",
      usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 80, totalTokenCount: 200 },
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const provider = new GeminiTrendAnalysisProvider({
      apiKey: "test-key",
      fetchImpl,
      now: () => new Date("2026-07-20T01:00:00.000Z"),
    });

    const result = await provider.analyze(evidence);

    expect(result.analysis.summary).toBe(analysis.summary);
    expect(result.model).toBe("gemini-3.1-flash-lite");
    expect(result.promptVersion).toBe("trend-analysis-v1");
    expect(result.generatedAt).toBe("2026-07-20T01:00:00.000Z");
    expect(result.usage.totalTokens).toBe(200);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("maps quota errors to a retryable provider error", async () => {
    const provider = new GeminiTrendAnalysisProvider({
      apiKey: "test-key",
      fetchImpl: vi.fn(async () => new Response(JSON.stringify({
        error: { message: "Quota exceeded" },
      }), { status: 429, headers: { "content-type": "application/json" } })),
    });

    await expect(provider.analyze(evidence)).rejects.toMatchObject({
      code: "RATE_LIMIT",
      retryable: true,
      status: 429,
    });
  });

  it("rejects output that does not satisfy the analysis schema", async () => {
    const provider = new GeminiTrendAnalysisProvider({
      apiKey: "test-key",
      fetchImpl: vi.fn(async () => new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: JSON.stringify({ summary: "too short" }) }] } }],
      }), { status: 200, headers: { "content-type": "application/json" } })),
    });

    await expect(provider.analyze(evidence)).rejects.toMatchObject({
      code: "INVALID_OUTPUT",
      retryable: false,
    });
  });
});
