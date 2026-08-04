import { describe, expect, it, vi } from "vitest";
import { GroqTrendAnalysisProvider } from "./groq";
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

describe("GroqTrendAnalysisProvider", () => {
  it("validates structured output and returns metadata", async () => {
    const fetchImpl = vi.fn(async (_url, init) => {
      // strict json_schema 구조화 출력을 요청했는지 확인한다(안 하면 Groq가 스키마를 보장하지 않는다).
      const body = JSON.parse(String(init.body));
      expect(body.response_format).toMatchObject({ type: "json_schema", json_schema: { strict: true } });
      return new Response(JSON.stringify({
        model: "openai/gpt-oss-20b",
        choices: [{ message: { content: JSON.stringify(analysis) }, finish_reason: "stop" }],
        usage: { prompt_tokens: 120, completion_tokens: 80, total_tokens: 200 },
      }), { status: 200, headers: { "content-type": "application/json" } });
    });
    const provider = new GroqTrendAnalysisProvider({
      apiKey: "test-key",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: () => new Date("2026-07-20T01:00:00.000Z"),
    });

    const result = await provider.analyze(evidence);

    expect(result.analysis.summary).toBe(analysis.summary);
    expect(result.provider).toBe("groq");
    expect(result.model).toBe("openai/gpt-oss-20b");
    expect(result.promptVersion).toBe("trend-analysis-v1");
    expect(result.generatedAt).toBe("2026-07-20T01:00:00.000Z");
    expect(result.usage.totalTokens).toBe(200);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("uses the OpenAI-compatible chat completions endpoint with a bearer token", async () => {
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
      expect((init.headers as Record<string, string>).authorization).toBe("Bearer test-key");
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify(analysis) } }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    });
    const provider = new GroqTrendAnalysisProvider({ apiKey: "test-key", fetchImpl: fetchImpl as unknown as typeof fetch });
    await provider.analyze(evidence);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("maps quota errors to a retryable provider error", async () => {
    const provider = new GroqTrendAnalysisProvider({
      apiKey: "test-key",
      fetchImpl: vi.fn(async () => new Response(JSON.stringify({
        error: { message: "Rate limit reached", type: "rate_limit_exceeded" },
      }), { status: 429, headers: { "content-type": "application/json" } })) as unknown as typeof fetch,
    });

    await expect(provider.analyze(evidence)).rejects.toMatchObject({
      code: "RATE_LIMIT",
      retryable: true,
      status: 429,
    });
  });

  it("maps auth errors to a non-retryable provider error", async () => {
    const provider = new GroqTrendAnalysisProvider({
      apiKey: "test-key",
      fetchImpl: vi.fn(async () => new Response(JSON.stringify({
        error: { message: "Invalid API Key" },
      }), { status: 401, headers: { "content-type": "application/json" } })) as unknown as typeof fetch,
    });

    await expect(provider.analyze(evidence)).rejects.toMatchObject({ code: "AUTH", retryable: false, status: 401 });
  });

  it("rejects output that does not satisfy the analysis schema", async () => {
    const provider = new GroqTrendAnalysisProvider({
      apiKey: "test-key",
      fetchImpl: vi.fn(async () => new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ summary: "too short" }) } }],
      }), { status: 200, headers: { "content-type": "application/json" } })) as unknown as typeof fetch,
    });

    await expect(provider.analyze(evidence)).rejects.toMatchObject({
      code: "INVALID_OUTPUT",
      retryable: false,
    });
  });

  it("throws a config error when no API key is provided", () => {
    expect(() => new GroqTrendAnalysisProvider({ apiKey: "" })).toThrow(/GROQ_API_KEY/);
  });
});
