import { Bookmark, LogIn } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { WatchButton } from "@/components/watch-button";
import { getPublishedTrends } from "@/data/live-trends";
import { getWatchlistViewer } from "@/data/watchlist";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "관심 목록", robots: { index: false, follow: false } };

export default async function WatchlistPage() {
  const [{ user, savedEntityIds }, trends] = await Promise.all([getWatchlistViewer(), getPublishedTrends()]);
  if (!user) return <div className="page"><section className="page-heading"><div><h1>관심 목록</h1><p>주목할 AI 서비스를 저장하고 점수 변화를 추적하세요.</p></div></section><section className="empty-state"><LogIn size={30} /><h2>로그인이 필요합니다</h2><p>Google 로그인 후 관심 서비스와 저장 당시 점수를 본인 계정에 안전하게 보관할 수 있습니다.</p><Link className="button button-primary" href="/login?next=/watchlist">Google 로그인</Link></section></div>;

  const savedTrends = trends.filter(({ id }) => savedEntityIds.has(id));
  return <div className="page"><section className="page-heading"><div><h1>관심 목록</h1><p>저장한 AI 서비스의 최신 트렌드 점수를 확인하세요.</p></div><div className="admin-summary"><Bookmark size={20} /><strong>{savedTrends.length}</strong><span>저장된 서비스</span></div></section>{savedTrends.length ? <section className="watchlist-grid">{savedTrends.map((trend) => <article className="panel watchlist-card" key={trend.id}><div><p className="eyebrow">{trend.category}</p><Link href={`/services/${trend.slug}`}><h2>{trend.name}</h2></Link><p>{trend.tagline}</p></div><div className="watchlist-score"><span>현재 점수</span><strong>{trend.trendScore}</strong><small>신뢰도 {trend.trustScore}</small></div><div className="watchlist-actions"><Link className="button button-primary" href={`/services/${trend.slug}`}>분석 보기</Link><WatchButton entityId={trend.id} initialSaved /></div></article>)}</section> : <section className="empty-state"><Bookmark size={30} /><h2>저장한 서비스가 없습니다</h2><p>트렌드 목록에서 관심 등록을 누르면 이곳에서 한 번에 확인할 수 있습니다.</p><Link className="button button-primary" href="/explore">AI 서비스 탐색</Link></section>}</div>;
}
