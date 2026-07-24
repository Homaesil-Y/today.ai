import type { Route } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

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

// 뉴스·탐색 등에서 공유하는 페이지네이션. PC는 번호, 모바일은 이전/다음 + "N / M"(CSS로 전환).
export function Pagination({ page, totalPages, hrefFor, list }: { page: number; totalPages: number; hrefFor: (page: number) => Route; list: string }) {
  if (totalPages <= 1) return null;
  const gaParamsFor = (targetPage: number) => JSON.stringify({ list, page_to: targetPage });
  return (
    <nav className="pagination" aria-label="페이지 이동">
      {page > 1
        ? <Link className="pagination-arrow" href={hrefFor(page - 1)} aria-label="이전 페이지" rel="prev" data-ga-event="paginate" data-ga-params={gaParamsFor(page - 1)}><ChevronLeft size={16} />이전</Link>
        : <span className="pagination-arrow is-disabled" aria-hidden="true"><ChevronLeft size={16} />이전</span>}

      <div className="pagination-numbers">
        {pageWindow(page, totalPages).map((entry, index) =>
          entry === "ellipsis"
            ? <span className="pagination-gap" key={`gap-${index}`}>…</span>
            : <Link className={`pagination-num ${entry === page ? "active" : ""}`} href={hrefFor(entry)} key={entry} aria-current={entry === page ? "page" : undefined} data-ga-event="paginate" data-ga-params={gaParamsFor(entry)}>{entry}</Link>,
        )}
      </div>

      <span className="pagination-status">{page} / {totalPages}</span>

      {page < totalPages
        ? <Link className="pagination-arrow" href={hrefFor(page + 1)} aria-label="다음 페이지" rel="next" data-ga-event="paginate" data-ga-params={gaParamsFor(page + 1)}>다음<ChevronRight size={16} /></Link>
        : <span className="pagination-arrow is-disabled" aria-hidden="true">다음<ChevronRight size={16} /></span>}
    </nav>
  );
}
