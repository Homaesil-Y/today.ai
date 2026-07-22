import { Activity, Boxes, GitFork, Radio, SlidersHorizontal } from "lucide-react";
import { RankingTable } from "@/components/ranking-table";
import { TopOneCard, TopSmallCard } from "@/components/trend-cards";
import { getPublishedTrends } from "@/data/live-trends";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const allTrends = await getPublishedTrends();
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
  return (
    <div className="page">
      <section className="page-heading">
        <div><p className="eyebrow">LIVE · APPROVED SIGNALS</p><h1>오늘의 AI 트렌드</h1><p>GitHub과 Hacker News에서 감지하고 검토를 통과한 AI 서비스입니다.</p></div>
        <div className="freshness"><span className="status-dot" />데이터 업데이트 완료<small>{updatedLabel ? `데이터 기준 · ${updatedLabel}` : "공개 데이터 승인 대기"}</small></div>
      </section>

      <section className="kpi-grid" aria-label="오늘의 핵심 지표">
        {kpis.map(({ label, value, delta, icon: Icon, tone }) => <article className="kpi-card" key={label}><div className={`kpi-icon tone-${tone}`}><Icon size={19} /></div><span>{label}</span><div><strong>{value}</strong><em>{delta}</em></div></article>)}
      </section>

      <section className="section-block">
        <div className="section-heading"><div><p className="eyebrow">TODAY&apos;S LEADERS</p><h2>가장 빠르게 확산 중</h2></div><p>누적 인기가 아닌 최근 반응 증가 속도 기준</p></div>
        {trends.length ? <div className="top-grid">{trends[0] && <TopOneCard trend={trends[0]} />}{trends.slice(1, 3).map((trend) => <TopSmallCard key={trend.id} trend={trend} />)}</div> : <div className="empty-state"><Radio size={30} /><h2>아직 공개된 후보가 없습니다</h2><p>관리자가 후보를 승인하면 실제 데이터가 이곳에 표시됩니다.</p></div>}
      </section>

      <section className="section-block">
        <div className="section-heading ranking-heading"><div><p className="eyebrow">TOP 10 · LIVE SIGNAL</p><h2>전체 트렌드 랭킹</h2></div><div className="filter-actions"><button className="button button-secondary"><SlidersHorizontal size={17} />전체 카테고리</button><button className="button button-secondary">트렌드 점수순</button></div></div>
        <div className="partial-notice" role="status"><Radio size={16} /><span><strong>MVP 데이터 안내</strong> 현재 순위는 GitHub·Hacker News 수집 신호를 기준으로 계산합니다.</span></div>
        {trends.length ? <RankingTable trends={trends} /> : null}
      </section>
    </div>
  );
}
