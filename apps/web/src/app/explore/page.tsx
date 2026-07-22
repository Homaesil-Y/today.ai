import { RankingTable } from "@/components/ranking-table";
import { getPublishedTrends } from "@/data/live-trends";
import { getSavedEntityIds } from "@/data/watchlist";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI 서비스 트렌드 탐색",
  description: "검토를 통과한 최신 AI 서비스를 트렌드 점수, 신뢰도, 카테고리와 수집 채널 기준으로 탐색하세요.",
  alternates: { canonical: "/explore" },
  openGraph: { title: "AI 서비스 트렌드 탐색 | 오늘의 AI", description: "최근 확산 속도가 빠른 AI 서비스를 한눈에 살펴보세요.", url: "/explore" },
};

export const dynamic = "force-dynamic";

export default async function ExplorePage() {
  const [trends, savedEntityIds] = await Promise.all([getPublishedTrends(), getSavedEntityIds()]);
  return <div className="page"><section className="page-heading"><div><h1>트렌드 탐색</h1><p>관리자 검토를 통과한 실제 AI 서비스를 탐색하세요.</p></div></section><div className="filter-bar"><button className="button button-secondary">오늘</button><button className="button button-secondary">전체 카테고리</button><button className="button button-secondary">전체 채널</button><button className="button button-secondary">신뢰도 60+</button></div>{trends.length ? <RankingTable trends={trends} savedEntityIds={savedEntityIds} /> : <section className="empty-state"><h2>공개된 서비스가 없습니다</h2><p>후보 검토 후 승인된 서비스만 표시됩니다.</p></section>}</div>;
}
