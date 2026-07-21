import { RankingTable } from "@/components/ranking-table";
import { getPublishedTrends } from "@/data/live-trends";

export const dynamic = "force-dynamic";

export default async function ExplorePage() {
  const trends = await getPublishedTrends();
  return <div className="page"><section className="page-heading"><div><p className="eyebrow">DISCOVER</p><h1>트렌드 탐색</h1><p>관리자 검토를 통과한 실제 AI 서비스를 탐색하세요.</p></div></section><div className="filter-bar"><button className="button button-secondary">오늘</button><button className="button button-secondary">전체 카테고리</button><button className="button button-secondary">전체 채널</button><button className="button button-secondary">신뢰도 60+</button></div>{trends.length ? <RankingTable trends={trends} /> : <section className="empty-state"><h2>공개된 서비스가 없습니다</h2><p>후보 검토 후 승인된 서비스만 표시됩니다.</p></section>}</div>;
}
