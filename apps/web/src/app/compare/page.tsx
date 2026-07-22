import { GitCompareArrows, X } from "lucide-react";
import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import { SourceBrandIcon } from "@/components/source-brand-icon";
import { getPublishedTrends } from "@/data/live-trends";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "서비스 비교",
  description: "관심 있는 AI 서비스를 최대 4개까지 나란히 비교하세요. 트렌드 점수·신뢰도·강점·약점·국내 활용 기회를 한눈에 확인합니다.",
  alternates: { canonical: "/compare" },
  openGraph: { title: "AI 서비스 비교 | 오늘의 AI", description: "AI 서비스를 최대 4개까지 나란히 비교합니다.", url: "/compare", type: "website" },
};

const MAX_COMPARE = 4;

const STATUS_LABEL: Record<string, string> = {
  NEW: "신규", RISING: "상승", SURGING: "급상승", PEAK: "정점",
  STABLE: "안정", FALLING: "하락", REVIVAL: "재부상", WATCH: "관찰 대상",
};

type Props = { searchParams: Promise<{ slugs?: string }> };

function parseSlugs(raw: string | undefined) {
  if (!raw) return [];
  return [...new Set(raw.split(",").map((s) => s.trim()).filter(Boolean))].slice(0, MAX_COMPARE);
}

export default async function ComparePage({ searchParams }: Props) {
  const { slugs: rawSlugs } = await searchParams;
  const requested = parseSlugs(rawSlugs);
  const trends = await getPublishedTrends();
  const bySlug = new Map(trends.map((trend) => [trend.slug, trend]));

  const selected = requested.map((slug) => bySlug.get(slug)).filter((t): t is NonNullable<typeof t> => Boolean(t));
  const selectedSlugs = selected.map((t) => t.slug);
  const available = trends.filter((t) => !selectedSlugs.includes(t.slug));

  const compareHref = (list: string[]) => (list.length ? `/compare?slugs=${list.join(",")}` : "/compare") as Route;

  return (
    <div className="page content-page">
      <header className="page-heading">
        <div>
          <h1>서비스 비교</h1>
          <p>관심 있는 AI 서비스를 최대 {MAX_COMPARE}개까지 나란히 비교하세요.</p>
        </div>
      </header>

      {selected.length < MAX_COMPARE && available.length > 0 && (
        <form className="compare-add" method="get" action="/compare">
          <label>
            <span className="sr-only">비교할 서비스 추가</span>
            <select name="slugs" defaultValue="">
              <option value="" disabled>비교할 서비스 추가…</option>
              {available.map((trend) => (
                <option key={trend.slug} value={[...selectedSlugs, trend.slug].join(",")}>
                  {trend.name} · {trend.category}
                </option>
              ))}
            </select>
          </label>
          <button className="button button-secondary" type="submit">추가</button>
          {selected.length > 0 && <Link className="button button-secondary" href="/compare"><X size={15} />전체 해제</Link>}
        </form>
      )}

      {selected.length === 0 ? (
        <section className="empty-state">
          <GitCompareArrows size={30} />
          <h2>비교할 서비스를 선택하세요</h2>
          <p>위 목록에서 서비스를 추가하면 트렌드 점수·신뢰도·강점·약점을 나란히 비교할 수 있습니다.</p>
          <Link className="button button-primary" href="/explore">서비스 탐색하기</Link>
        </section>
      ) : (
        <section className="compare-grid" style={{ gridTemplateColumns: `160px repeat(${selected.length}, minmax(0, 1fr))` }} aria-label="서비스 비교표">
          <div className="compare-row-head" />
          {selected.map((trend) => (
            <div className="compare-col-head" key={trend.slug}>
              <Link className="compare-remove" href={compareHref(selectedSlugs.filter((s) => s !== trend.slug))} aria-label={`${trend.name} 비교에서 제거`}><X size={14} /></Link>
              <Link href={`/services/${trend.slug}` as Route}><strong>{trend.name}</strong></Link>
              <span className="category-chip">{trend.category}</span>
            </div>
          ))}

          <div className="compare-label">트렌드 점수</div>
          {selected.map((t) => <div className="compare-cell compare-metric" key={`${t.slug}-score`}><strong>{t.trendScore.toFixed(1)}</strong></div>)}

          <div className="compare-label">신뢰도</div>
          {selected.map((t) => <div className="compare-cell compare-metric" key={`${t.slug}-trust`}><strong>{t.trustScore.toFixed(0)}</strong></div>)}

          <div className="compare-label">상태</div>
          {selected.map((t) => <div className="compare-cell" key={`${t.slug}-status`}>{STATUS_LABEL[t.status] ?? t.status}</div>)}

          <div className="compare-label">수집 채널</div>
          {selected.map((t) => (
            <div className="compare-cell compare-sources" key={`${t.slug}-src`}>
              {t.sources.map((s) => <SourceBrandIcon key={s} source={s} size="small" />)}
            </div>
          ))}

          <div className="compare-label">강점</div>
          {selected.map((t) => (
            <div className="compare-cell" key={`${t.slug}-str`}>
              {t.strengths.length ? <ul>{t.strengths.slice(0, 3).map((v, i) => <li key={i}>{v}</li>)}</ul> : <span className="compare-empty">—</span>}
            </div>
          ))}

          <div className="compare-label">약점</div>
          {selected.map((t) => (
            <div className="compare-cell" key={`${t.slug}-weak`}>
              {t.weaknesses.length ? <ul>{t.weaknesses.slice(0, 3).map((v, i) => <li key={i}>{v}</li>)}</ul> : <span className="compare-empty">—</span>}
            </div>
          ))}

          <div className="compare-label">국내 활용 기회</div>
          {selected.map((t) => <div className="compare-cell" key={`${t.slug}-kr`}>{t.koreaOpportunity || <span className="compare-empty">—</span>}</div>)}
        </section>
      )}
    </div>
  );
}
