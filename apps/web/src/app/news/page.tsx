import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import { ArrowUpRight, ChevronLeft, ChevronRight, Newspaper, Search, X } from "lucide-react";
import { FormDropdown } from "@/components/form-dropdown";
import { getNewsPage, type NewsField } from "@/data/news";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "AI 뉴스",
  description: "글로벌 AI 뉴스를 매 3시간 수집해 한국어로 요약한 브리핑입니다.",
  alternates: { canonical: "/news" },
  openGraph: { title: "AI 뉴스 브리핑 | 오늘의AI", description: "글로벌 AI 뉴스를 한국어로 정리한 브리핑.", url: "/news", type: "website" },
};

const PAGE_SIZE = 10;

type SearchParams = Promise<{ field?: string; q?: string; page?: string }>;

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

// 현재 페이지 주변 + 처음/끝만 노출하고 사이는 생략(…)한다.
function pageWindow(current: number, total: number): (number | "ellipsis")[] {
  const shown = new Set<number>();
  for (let p = 1; p <= total; p += 1) {
    if (p === 1 || p === total || Math.abs(p - current) <= 1) shown.add(p);
  }
  const sorted = [...shown].sort((a, b) => a - b);
  const out: (number | "ellipsis")[] = [];
  let prev = 0;
  for (const p of sorted) {
    if (prev && p - prev > 1) out.push("ellipsis");
    out.push(p);
    prev = p;
  }
  return out;
}

export default async function NewsPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const field: NewsField = raw.field === "source" ? "source" : "content";
  const q = (raw.q ?? "").trim();
  const page = Math.max(1, Number.parseInt(raw.page ?? "1", 10) || 1);

  const { items, total } = await getNewsPage({ field, q, page, pageSize: PAGE_SIZE });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const today = currentKstDate();

  const hrefFor = (targetPage: number) => {
    const params = new URLSearchParams();
    if (q) {
      if (field === "source") params.set("field", "source");
      params.set("q", q);
    }
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
        <FormDropdown
          name="field"
          ariaLabel="검색 대상"
          placeholder="제목/내용"
          defaultValue={field}
          options={[{ value: "content", label: "제목/내용" }, { value: "source", label: "출처" }]}
        />
        <label className="news-search">
          <Search size={17} aria-hidden="true" />
          <span className="sr-only">뉴스 검색</span>
          <input type="search" name="q" defaultValue={q} placeholder="검색어를 입력하세요" />
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

          {totalPages > 1 && (
            <nav className="news-pagination" aria-label="페이지 이동">
              {page > 1
                ? <Link className="news-page-arrow" href={hrefFor(page - 1)} aria-label="이전 페이지" rel="prev"><ChevronLeft size={16} />이전</Link>
                : <span className="news-page-arrow is-disabled" aria-hidden="true"><ChevronLeft size={16} />이전</span>}

              <div className="news-page-numbers">
                {pageWindow(page, totalPages).map((entry, index) =>
                  entry === "ellipsis"
                    ? <span className="news-page-gap" key={`gap-${index}`}>…</span>
                    : <Link className={`news-page-num ${entry === page ? "active" : ""}`} href={hrefFor(entry)} key={entry} aria-current={entry === page ? "page" : undefined}>{entry}</Link>,
                )}
              </div>

              <span className="news-page-status">{page} / {totalPages}</span>

              {page < totalPages
                ? <Link className="news-page-arrow" href={hrefFor(page + 1)} aria-label="다음 페이지" rel="next">다음<ChevronRight size={16} /></Link>
                : <span className="news-page-arrow is-disabled" aria-hidden="true">다음<ChevronRight size={16} /></span>}
            </nav>
          )}
        </>
      )}
    </div>
  );
}
