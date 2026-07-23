import type { Metadata } from "next";
import Link from "next/link";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { FormDropdown } from "@/components/form-dropdown";
import { RankingTable } from "@/components/ranking-table";
import { getSourceLabel } from "@/components/source-brand-icon";
import { getPublishedTrends } from "@/data/live-trends";
import { filterAndSortTrends, summarizeCategories } from "@/data/trend-query";
import { getSavedEntityIds } from "@/data/watchlist";

export const metadata: Metadata = {
  title: "AI 서비스 트렌드 탐색",
  description: "검토를 통과한 최신 AI 서비스를 트렌드 점수, 신뢰도, 카테고리와 수집 채널 기준으로 탐색하세요.",
  alternates: { canonical: "/explore" },
  openGraph: { title: "AI 서비스 트렌드 탐색 | 오늘의AI", description: "최근 확산 속도가 빠른 AI 서비스를 한눈에 살펴보세요.", url: "/explore" },
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
  // 실제로 수집된 채널만 옵션으로 노출한다. 데이터에 없는 채널을 고르면 항상 0건이 나와 고장으로 보이기 때문.
  const availableSources = [...new Set(trends.flatMap((trend) => trend.sources))];
  const sourceOptions = [{ value: "", label: "전체 채널" }, ...availableSources.map((source) => ({ value: source, label: getSourceLabel(source) }))];
  const hasFilters = Boolean(query.q || query.category || query.source || query.minTrust || query.period !== "all" || query.sort !== "score");

  return <div className="page"><section className="page-heading"><div><h1>트렌드 탐색</h1><p>서비스명과 설명을 검색하고 실제 수집 신호를 조합해 탐색하세요.</p></div></section><form className="explore-toolbar" action="/explore" role="search"><label className="explore-search"><Search size={17} /><span className="sr-only">서비스 검색</span><input name="q" type="search" defaultValue={query.q} placeholder="서비스명, 설명, 카테고리 검색" /></label><label><span>기간</span><FormDropdown name="period" ariaLabel="기간" placeholder="전체 기간" defaultValue={query.period} options={[{ value: "all", label: "전체 기간" }, { value: "today", label: "최근 24시간" }, { value: "7d", label: "최근 7일" }, { value: "30d", label: "최근 30일" }]} /></label><label><span>카테고리</span><FormDropdown name="category" ariaLabel="카테고리" placeholder="전체 카테고리" defaultValue={query.category} options={[{ value: "", label: "전체 카테고리" }, ...categories.map(({ name, count }) => ({ value: name, label: `${name} (${count})` }))]} /></label><label><span>채널</span><FormDropdown name="source" ariaLabel="채널" placeholder="전체 채널" defaultValue={query.source} options={sourceOptions} /></label><label><span>신뢰도</span><FormDropdown name="minTrust" ariaLabel="신뢰도" placeholder="전체" defaultValue={query.minTrust} options={[{ value: "", label: "전체" }, { value: "60", label: "60 이상" }, { value: "70", label: "70 이상" }, { value: "80", label: "80 이상" }, { value: "90", label: "90 이상" }]} /></label><label><span>정렬</span><FormDropdown name="sort" ariaLabel="정렬" placeholder="트렌드 점수순" defaultValue={query.sort} options={[{ value: "score", label: "트렌드 점수순" }, { value: "trust", label: "신뢰도순" }, { value: "recent", label: "최근 갱신순" }, { value: "name", label: "이름순" }]} /></label><button className="button button-primary" type="submit"><SlidersHorizontal size={17} />적용</button>{hasFilters && <Link className="button button-secondary" href="/explore"><X size={16} />초기화</Link>}</form><div className="result-summary"><strong>{filtered.length}</strong>개의 AI 서비스를 찾았습니다.{query.q && <span>검색어: “{query.q}”</span>}</div>{filtered.length ? <RankingTable trends={filtered} savedEntityIds={savedEntityIds} /> : <section className="empty-state"><Search size={30} /><h2>조건에 맞는 서비스가 없습니다</h2><p>검색어를 줄이거나 필터를 초기화해 다시 확인해보세요.</p><Link className="button button-primary" href="/explore">전체 서비스 보기</Link></section>}</div>;
}
