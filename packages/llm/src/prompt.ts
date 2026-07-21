import type { TrendEvidence } from "./schema";

export const TREND_ANALYSIS_PROMPT_VERSION = "trend-analysis-v1";

export function buildTrendAnalysisPrompt(input: TrendEvidence): string {
  return [
    "아래 증거만 사용해 AI 서비스 트렌드를 한국어로 분석하세요.",
    "증거에 없는 사실을 만들지 마세요.",
    "가격, 라이선스, 출시일은 officialFacts 또는 출처 본문에 명시된 경우만 확정하세요.",
    "확인할 수 없는 가격 유형은 unknown으로 반환하세요.",
    "강점과 약점도 근거에서 합리적으로 확인 가능한 범위로 제한하세요.",
    "트렌드 점수나 순위는 계산하지 마세요.",
    "모든 배열 항목은 짧고 구체적인 한국어 문장으로 작성하세요.",
    "",
    JSON.stringify(input),
  ].join("\n");
}
