import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import { ArrowUpRight, Newspaper, Search, X } from "lucide-react";
import { Pagination } from "@/components/pagination";
import { getNewsPage } from "@/data/news";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "AI 뉴스",
  description: "글로벌 AI 뉴스를 매 3시간 수집해 한국어로 요약한 브리핑입니다.",
  alternates: { canonical: "/news" },
  openGraph: { title: "AI 뉴스 브리핑 | 오늘의AI", description: "글로벌 AI 뉴스를 한국어로 정리한 브리핑.", url: "/news", type: "website" },
};

const PAGE_SIZE = 10;

type SearchParams = Promise<{ q?: string; page?: string }>;

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric" }).format(new Date(iso));
}

// 순수 함수(모듈 스코프)로 감싸 렌더 중 impure 호출 린트를 피한다.
function currentKstDate() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
}
function kstDate(iso: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date(iso));
}

export default async function NewsPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const q = (raw.q ?? "").trim();
  const page = Math.max(1, Number.parseInt(raw.page ?? "1", 10) || 1);

  const { items, total } = await getNewsPage({ q, page, pageSize: PAGE_SIZE });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const today = currentKstDate();

  const hrefFor = (targetPage: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (targetPage > 1) params.set("page", String(targetPage));
    const query = params.toString();
    return (query ? `/news?${query}` : "/news") as Route;
  };

  return (
    <div className="page">
      <section className="page-heading">
        <div>
          <h1>AI 뉴스 브리핑</h1>
          <p>글로벌 AI 뉴스를 매 3시간 수집해 한국어로 정리합니다.</p>
        </div>
        {total > 0 && <div className="freshness"><span className="status-dot" />업데이트 완료<small>전체 {total.toLocaleString("ko-KR")}건</small></div>}
      </section>

      <form className="news-toolbar" action="/news" method="get">
        <label className="news-search">
          <Search size={17} aria-hidden="true" />
          <span className="sr-only">뉴스 검색</span>
          <input type="search" name="q" defaultValue={q} placeholder="제목·내용·출처 검색" />
        </label>
        <button className="button button-primary" type="submit">검색</button>
        {q && <Link className="button button-secondary" href="/news"><X size={16} />초기화</Link>}
      </form>

      {items.length === 0 ? (
        <div className="empty-state">
          <Newspaper size={30} />
          <h2>{q ? "검색 결과가 없습니다" : "아직 수집된 뉴스가 없습니다"}</h2>
          <p>{q ? "다른 검색어나 검색 대상으로 다시 시도해보세요." : "글로벌 AI 뉴스를 3시간마다 수집해 한국어로 정리합니다. 첫 수집이 완료되면 이곳에 표시됩니다."}</p>
        </div>
      ) : (
        <>
          <div className="news-list">
            {items.map((item) => {
              const isToday = kstDate(item.publishedAt) === today;
              return (
                <article className="news-item" key={item.id}>
                  <div className="news-title-row">
                    {isToday && <span className="news-today">TODAY</span>}
                    <a className="news-title" href={item.url} target="_blank" rel="noreferrer">{item.title}</a>
                  </div>
                  <p className="news-summary">{item.summary}</p>
                  <div className="news-meta">
                    <span className="news-source">{item.source}</span>
                    <span aria-hidden="true">·</span>
                    <span>{formatDate(item.publishedAt)}</span>
                    <a className="news-external" href={item.url} target="_blank" rel="noreferrer">원문 <ArrowUpRight size={13} aria-hidden="true" /></a>
                  </div>
                </article>
              );
            })}
          </div>

          <Pagination page={page} totalPages={totalPages} hrefFor={hrefFor} />
        </>
      )}
    </div>
  );
}
