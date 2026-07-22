import type { Metadata } from "next";
import Link from "next/link";
import { StructuredData } from "@/components/structured-data";
import { absoluteUrl, siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "AI 트렌드 분석 방법론",
  description: "오늘의 AI가 공개 신호를 수집하고 Trend Score와 Trust Score를 계산하며 한국어 분석을 만드는 방법을 설명합니다.",
  alternates: { canonical: "/methodology" },
  openGraph: { title: "AI 트렌드 분석 방법론 | 오늘의 AI", description: "수집 채널, 점수 원칙, AI 분석과 검수 기준을 투명하게 공개합니다.", url: "/methodology", type: "article" },
};

const steps = [
  ["1. 공개 신호 수집", "현재 GitHub 저장소 활동과 Hacker News 게시물 반응을 수집합니다. 연결되지 않은 채널의 신호는 있는 것처럼 표시하지 않습니다."],
  ["2. 후보 정규화", "URL과 저장소 정보를 정규화하고 같은 서비스로 판단되는 항목을 하나의 엔티티로 통합합니다."],
  ["3. 점수 계산", "누적 인기도보다 최근 반응 증가 속도, 신규성, 제품 성장과 교차 출처 신호를 코드 기반 공식으로 계산합니다."],
  ["4. AI 분석과 검수", "상위 후보만 Gemini로 한국어 요약하고, 출처에 없는 사실은 생성하지 않도록 구조화된 결과를 검증한 뒤 공개합니다."],
] as const;

export default function MethodologyPage() {
  const article = {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: "오늘의 AI 트렌드 분석 방법론",
    description: "공개 신호 수집부터 점수 계산, AI 요약, 공개 검수까지의 방법론",
    url: absoluteUrl("/methodology"),
    inLanguage: siteConfig.language,
    datePublished: "2026-07-22",
    dateModified: "2026-07-22",
    author: { "@id": absoluteUrl("/#organization") },
    publisher: { "@id": absoluteUrl("/#organization") },
  };
  return <div className="page content-page"><StructuredData data={article} /><header className="page-heading"><div><h1>AI 트렌드 분석 방법론</h1><p>점수와 AI 설명이 만들어지는 과정을 투명하게 공개합니다.</p></div></header><section className="content-lead"><h2>무엇을 기준으로 ‘뜨는 AI’라고 판단하나요?</h2><p>오늘의 AI는 단순 누적 인기 순위가 아니라 최근 반응의 증가 속도와 여러 독립 신호를 함께 봅니다. Trend Score는 관심의 강도를, Trust Score는 그 신호를 얼마나 신뢰할 수 있는지를 구분해 표현합니다.</p></section><section className="method-steps">{steps.map(([title, description]) => <article className="panel" key={title}><h2>{title}</h2><p>{description}</p></article>)}</section><section className="content-section"><h2>해석할 때 주의할 점</h2><ul><li>점수는 절대적인 제품 품질이나 투자 가치를 뜻하지 않습니다.</li><li>데이터가 적은 신규 서비스는 상태가 ‘관찰 대상’으로 표시될 수 있습니다.</li><li>AI 요약은 수집된 근거를 이해하기 쉽게 정리한 것이며 공식 발표를 대체하지 않습니다.</li><li>가격·라이선스·출시일은 각 서비스의 공식 사이트에서 재확인해야 합니다.</li></ul></section><div className="content-actions"><Link className="button button-primary" href="/explore">현재 트렌드 살펴보기</Link><Link className="button button-secondary" href="/llms.txt">AI 크롤러 안내</Link></div></div>;
}
