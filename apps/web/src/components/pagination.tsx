import type { Route } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

const PAGE_BLOCK_SIZE = 10;

// 뉴스·탐색 등에서 공유하는 페이지네이션. PC는 10페이지 블록 번호 + «/‹/›/», 모바일은 이전/다음 + "N / M"(CSS로 전환).
export function Pagination({ page, totalPages, hrefFor, list }: { page: number; totalPages: number; hrefFor: (page: number) => Route; list: string }) {
  if (totalPages <= 1) return null;
  const gaParamsFor = (targetPage: number) => JSON.stringify({ list, page_to: targetPage });
  // 네이버 메일 방식: 10개 단위 블록으로 페이지 번호를 보여준다. 블록 경계는 «/»로 이동.
  const blockStart = Math.floor((page - 1) / PAGE_BLOCK_SIZE) * PAGE_BLOCK_SIZE + 1;
  const blockEnd = Math.min(blockStart + PAGE_BLOCK_SIZE - 1, totalPages);
  const pages = Array.from({ length: blockEnd - blockStart + 1 }, (_, index) => blockStart + index);
  const hasPrevBlock = blockStart > 1;
  const hasNextBlock = blockEnd < totalPages;

  return (
    <nav className="pagination" aria-label="페이지 이동">
      {hasPrevBlock
        ? <Link className="pagination-arrow pagination-block" href={hrefFor(blockStart - 1)} aria-label="이전 10페이지" data-ga-event="paginate" data-ga-params={gaParamsFor(blockStart - 1)}><ChevronsLeft size={16} /></Link>
        : <span className="pagination-arrow pagination-block is-disabled" aria-hidden="true"><ChevronsLeft size={16} /></span>}

      {page > 1
        ? <Link className="pagination-arrow" href={hrefFor(page - 1)} aria-label="이전 페이지" rel="prev" data-ga-event="paginate" data-ga-params={gaParamsFor(page - 1)}><ChevronLeft size={16} />이전</Link>
        : <span className="pagination-arrow is-disabled" aria-hidden="true"><ChevronLeft size={16} />이전</span>}

      <div className="pagination-numbers">
        {pages.map((entry) =>
          <Link className={`pagination-num ${entry === page ? "active" : ""}`} href={hrefFor(entry)} key={entry} aria-current={entry === page ? "page" : undefined} data-ga-event="paginate" data-ga-params={gaParamsFor(entry)}>{entry}</Link>,
        )}
      </div>

      <span className="pagination-status">{page} / {totalPages}</span>

      {page < totalPages
        ? <Link className="pagination-arrow" href={hrefFor(page + 1)} aria-label="다음 페이지" rel="next" data-ga-event="paginate" data-ga-params={gaParamsFor(page + 1)}>다음<ChevronRight size={16} /></Link>
        : <span className="pagination-arrow is-disabled" aria-hidden="true">다음<ChevronRight size={16} /></span>}

      {hasNextBlock
        ? <Link className="pagination-arrow pagination-block" href={hrefFor(blockEnd + 1)} aria-label="다음 10페이지" data-ga-event="paginate" data-ga-params={gaParamsFor(blockEnd + 1)}><ChevronsRight size={16} /></Link>
        : <span className="pagination-arrow pagination-block is-disabled" aria-hidden="true"><ChevronsRight size={16} /></span>}
    </nav>
  );
}
