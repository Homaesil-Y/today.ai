import type { Metadata } from "next";
import Link from "next/link";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { RankingTable } from "@/components/ranking-table";
import { getPublishedTrends } from "@/data/live-trends";
import { filterAndSortTrends, summarizeCategories } from "@/data/trend-query";
import { getSavedEntityIds } from "@/data/watchlist";

export const metadata: Metadata = {
  title: "AI 서비스 트렌드 탐색",
  description: "검토를 통과한 최신 AI 서비스를 트렌드 점수, 신뢰도, 카테고리와 수집 채널 기준으로 탐색하세요.",
  alternates: { canonical: "/explore" },
  openGraph: { title: "AI 서비스 트렌드 탐색 | 오늘의 AI", description: "최근 확산 속도가 빠른 AI 서비스를 한눈에 살펴보세요.", url: "/explore" },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function ExplorePage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const query = {
    q: first(raw.q),
    period: first(raw.period) || "all",
    category: first(raw.category),
    source: first(raw.source),
    minTrust: first(raw.minTrust),
    sort: first(raw.sort) || "score",
  };
  const [trends, savedEntityIds] = await Promise.all([getPublishedTrends(), getSavedEntityIds()]);
  const filtered = filterAndSortTrends(trends, query);
  const categories = summarizeCategories(trends);
  const hasFilters = Boolean(query.q || query.category || query.source || query.minTrust || query.period !== "all" || query.sort !== "score");

  return <div className="page"><section className="page-heading"><div><h1>트렌드 탐색</h1><p>서비스명과 설명을 검색하고 실제 수집 신호를 조합해 탐색하세요.</p></div></section><form className="explore-toolbar" action="/explore" role="search"><label className="explore-search"><Search size={17} /><span className="sr-only">서비스 검색</span><input name="q" type="search" defaultValue={query.q} placeholder="서비스명, 설명, 카테고리 검색" /></label><label><span>기간</span><select name="period" defaultValue={query.period}><option value="all">전체 기간</option><option value="today">최근 24시간</option><option value="7d">최근 7일</option><option value="30d">최근 30일</option></select></label><label><span>카테고리</span><select name="category" defaultValue={query.category}><option value="">전체 카테고리</option>{categories.map(({ name, count }) => <option key={name} value={name}>{name} ({count})</option>)}</select></label><label><span>채널</span><select name="source" defaultValue={query.source}><option value="">전체 채널</option><option value="github">GitHub</option><option value="hacker_news">Hacker News</option><option value="product_hunt">Product Hunt</option><option value="reddit">Reddit</option><option value="threads">Threads</option><option value="instagram">Instagram</option></select></label><label><span>신뢰도</span><select name="minTrust" defaultValue={query.minTrust}><option value="">전체</option><option value="60">60 이상</option><option value="70">70 이상</option><option value="80">80 이상</option><option value="90">90 이상</option></select></label><label><span>정렬</span><select name="sort" defaultValue={query.sort}><option value="score">트렌드 점수순</option><option value="trust">신뢰도순</option><option value="recent">최근 갱신순</option><option value="name">이름순</option></select></label><button className="button button-primary" type="submit"><SlidersHorizontal size={17} />적용</button>{hasFilters && <Link className="button button-secondary" href="/explore"><X size={16} />초기화</Link>}</form><div className="result-summary"><strong>{filtered.length}</strong>개의 AI 서비스를 찾았습니다.{query.q && <span>검색어: “{query.q}”</span>}</div>{filtered.length ? <RankingTable trends={filtered} savedEntityIds={savedEntityIds} /> : <section className="empty-state"><Search size={30} /><h2>조건에 맞는 서비스가 없습니다</h2><p>검색어를 줄이거나 필터를 초기화해 다시 확인해보세요.</p><Link className="button button-primary" href="/explore">전체 서비스 보기</Link></section>}</div>;
}
