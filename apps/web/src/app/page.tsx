import { Activity, Boxes, GitFork, Radio, SlidersHorizontal } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { RankingTable } from "@/components/ranking-table";
import { StructuredData } from "@/components/structured-data";
import { TopOneCard, TopSmallCard } from "@/components/trend-cards";
import { getPublishedTrends } from "@/data/live-trends";
import { getSavedEntityIds } from "@/data/watchlist";
import { absoluteUrl, siteConfig } from "@/lib/site";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: { absolute: "오늘의 AI · 오늘 뜨는 AI 서비스 트렌드" },
  description: siteConfig.description,
  alternates: { canonical: "/" },
};

const faqItems = [
  { question: "오늘의 AI는 어떤 서비스인가요?", answer: "GitHub과 Hacker News의 공개 신호를 수집하고 최근 확산 속도를 분석해 주목할 AI 서비스를 한국어로 설명하는 트렌드 인텔리전스 서비스입니다." },
  { question: "AI 서비스 순위는 어떻게 정하나요?", answer: "단순 누적 인기보다 최근 반응 증가 속도, 신규성, 제품 성장, 교차 출처 신호를 코드 기반 Trend Score로 계산합니다." },
  { question: "AI가 작성한 분석을 그대로 믿어도 되나요?", answer: "AI 분석은 수집된 근거를 요약한 참고 정보입니다. 가격, 라이선스, 출시일 같은 사실은 연결된 공식 사이트와 원문에서 다시 확인해야 합니다." },
] as const;

export default async function DashboardPage() {
  const [allTrends, savedEntityIds] = await Promise.all([getPublishedTrends(), getSavedEntityIds()]);
  const trends = allTrends.slice(0, 10);
  const kpis = [
    { label: "공개된 AI 서비스", value: allTrends.length, delta: "실시간", icon: Radio, tone: "cyan" },
    { label: "상승 중인 서비스", value: allTrends.filter(({ status }) => ["RISING", "SURGING", "PEAK"].includes(status)).length, delta: "승인 기준", icon: Activity, tone: "orange" },
    { label: "교차 채널 확산", value: allTrends.filter(({ sources }) => sources.length > 1).length, delta: "2개+ 채널", icon: GitFork, tone: "violet" },
    { label: "오픈소스", value: allTrends.filter(({ isOpenSource }) => isOpenSource).length, delta: "GitHub 기준", icon: Boxes, tone: "blue" },
  ] as const;
  const updatedAt = trends[0]?.updatedAt ? new Date(trends[0].updatedAt) : null;
  const updatedLabel = updatedAt
    ? new Intl.DateTimeFormat("ko-KR", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(updatedAt)
    : null;
  const collectionData = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "오늘의 AI 트렌드",
    description: siteConfig.description,
    url: siteConfig.url,
    inLanguage: siteConfig.language,
    dateModified: updatedAt?.toISOString(),
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: trends.length,
      itemListOrder: "https://schema.org/ItemListOrderDescending",
      itemListElement: trends.map((trend) => ({ "@type": "ListItem", position: trend.rank, name: trend.name, url: absoluteUrl(`/services/${trend.slug}`) })),
    },
  };
  const faqData = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faqItems.map(({ question, answer }) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } })) };
  return (
    <div className="page">
      <StructuredData data={[collectionData, faqData]} />
      <section className="page-heading">
        <div><h1>오늘의 AI 트렌드</h1><p>GitHub·Hacker News·Product Hunt에서 감지하고 검토를 통과한 AI 서비스입니다.</p></div>
        <div className="freshness"><span className="status-dot" />데이터 업데이트 완료<small>{updatedLabel ? `${updatedLabel} 기준 · 연동 정상` : "공개 데이터 승인 대기"}</small></div>
      </section>

      <section className="kpi-grid" aria-label="오늘의 핵심 지표">
        {kpis.map(({ label, value, delta, icon: Icon, tone }) => <article className="kpi-card" key={label}><div className={`kpi-icon tone-${tone}`}><Icon size={19} /></div><span>{label}</span><div><strong>{value}</strong><em>{delta}</em></div></article>)}
      </section>

      <section className="section-block">
        <div className="section-heading"><div><h2>가장 빠르게 확산 중</h2></div><p>누적 인기가 아닌 최근 반응 증가 속도 기준</p></div>
        {trends.length ? <div className="top-grid">{trends[0] && <TopOneCard trend={trends[0]} initialSaved={savedEntityIds.has(trends[0].id)} />}{trends.slice(1, 3).map((trend) => <TopSmallCard key={trend.id} trend={trend} />)}</div> : <div className="empty-state"><Radio size={30} /><h2>아직 공개된 후보가 없습니다</h2><p>관리자가 후보를 승인하면 실제 데이터가 이곳에 표시됩니다.</p></div>}
      </section>

      <section className="section-block">
        <div className="section-heading ranking-heading"><div><h2>전체 트렌드 랭킹</h2></div><div className="filter-actions"><button className="button button-secondary"><SlidersHorizontal size={17} />전체 카테고리</button><button className="button button-secondary">트렌드 점수순</button></div></div>
        <div className="partial-notice" role="status"><Radio size={16} /><span><strong>MVP 데이터 안내</strong> 현재 순위는 GitHub·Hacker News 수집 신호를 기준으로 계산합니다.</span></div>
        {trends.length ? <RankingTable trends={trends} savedEntityIds={savedEntityIds} /> : null}
      </section>

      <section className="section-block answer-section" aria-labelledby="answer-heading">
        <div className="section-heading"><div><h2 id="answer-heading">오늘의 AI, 이렇게 읽으세요</h2></div><Link href="/methodology">분석 방법론 전체 보기</Link></div>
        <div className="answer-grid">{faqItems.map(({ question, answer }) => <article className="panel" key={question}><h3>{question}</h3><p>{answer}</p></article>)}</div>
      </section>
    </div>
  );
}
