// 로딩 중 레이아웃 이동(CLS) 없이 자리를 잡아주는 스켈레톤 프리미티브.
// loading.tsx들에서 재사용한다. 순수 프레젠테이션(서버 컴포넌트).

export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <span className={`skeleton${className ? ` ${className}` : ""}`} style={style} aria-hidden="true" />;
}

// 페이지 상단 제목 영역 자리.
export function HeadingSkeleton() {
  return (
    <div className="skeleton-heading">
      <Skeleton className="skeleton-title" />
      <Skeleton className="skeleton-subtitle" />
    </div>
  );
}

// 카드 그리드(홈 KPI/카테고리 등) 자리.
export function CardGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="skeleton-grid" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} className="skeleton-card" />
      ))}
    </div>
  );
}

// 랭킹 표/목록 행 자리.
export function RowsSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="skeleton-rows" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} className="skeleton-row" />
      ))}
    </div>
  );
}

// 라우트 전환 시 기본으로 보여줄 범용 페이지 스켈레톤.
export function PageSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="page" role="status" aria-label="불러오는 중">
      <HeadingSkeleton />
      <CardGridSkeleton />
      <RowsSkeleton count={rows} />
      <span className="sr-only">콘텐츠를 불러오는 중입니다.</span>
    </div>
  );
}
