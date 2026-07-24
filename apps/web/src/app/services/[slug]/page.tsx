import { ArrowLeft, ArrowUpRight, CheckCircle2, Clock3, ExternalLink, GitBranch, GitCompareArrows, ShieldCheck, Sparkles, TriangleAlert, Users } from "lucide-react";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StructuredData } from "@/components/structured-data";
import { getSourceLabel, SourceBrandIcon } from "@/components/source-brand-icon";
import { StatusBadge } from "@/components/status-badge";
import { TrendPeriodChart } from "@/components/trend-period-chart";
import { WatchButton } from "@/components/watch-button";
import { getPublishedTrend, getTrendScoreHistory } from "@/data/live-trends";
import { getSavedEntityIds } from "@/data/watchlist";
import { absoluteUrl, siteConfig } from "@/lib/site";

type Props = { params: Promise<{ slug: string }> };

// 수집 시각을 KST 기준 실제 값으로 표기한다(고정 "5분 전" 같은 가짜 문구 금지).
function formatCollectedAt(iso: string) {
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const trend = await getPublishedTrend((await params).slug);
  if (!trend) return {};
  const path = `/services/${trend.slug}`;
  return {
    title: `${trend.name} 분석·트렌드 점수`,
    description: trend.tagline,
    alternates: { canonical: path },
    openGraph: { title: `${trend.name} AI 서비스 분석`, description: trend.tagline, url: path, type: "article", modifiedTime: trend.updatedAt, images: [{ url: `${path}/opengraph-image`, width: 1200, height: 630, alt: `${trend.name} 트렌드 분석` }] },
    twitter: { card: "summary_large_image", title: `${trend.name} 분석 | 오늘의AI`, description: trend.tagline, images: [`${path}/opengraph-image`] },
  };
}

export default async function ServiceDetailPage({ params }: Props) {
  const [trend, savedEntityIds] = await Promise.all([getPublishedTrend((await params).slug), getSavedEntityIds()]);
  if (!trend) notFound();
  const scoreHistory = await getTrendScoreHistory(trend.id);
  const nowIso = new Date().toISOString();
  const pageUrl = absoluteUrl(`/services/${trend.slug}`);
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: trend.name,
    description: trend.description,
    url: trend.canonicalUrl,
    mainEntityOfPage: pageUrl,
    applicationCategory: trend.category,
    operatingSystem: "Web",
    isAccessibleForFree: ["free", "open_source"].includes(trend.pricingType),
    dateModified: trend.updatedAt,
    inLanguage: siteConfig.language,
    ...(trend.githubUrl ? { sameAs: [trend.githubUrl] } : {}),
    additionalProperty: [
      { "@type": "PropertyValue", name: "Trend Score", value: trend.trendScore },
      { "@type": "PropertyValue", name: "Trust Score", value: trend.trustScore },
      { "@type": "PropertyValue", name: "Trend Status", value: trend.status },
    ],
    subjectOf: { "@type": "Article", headline: `${trend.name}이 지금 주목받는 이유`, url: pageUrl, dateModified: trend.updatedAt, author: { "@id": absoluteUrl("/#organization") } },
  };
  return (
    <div className="page detail-page">
      <StructuredData data={structuredData} />
      <Link href="/" className="back-link"><ArrowLeft size={17} />오늘의 레이더</Link>
      <section className="detail-hero">
        <div className="detail-identity"><div><div className="detail-badges"><StatusBadge status={trend.status} /><span className="category-chip">{trend.category}</span>{trend.isOpenSource && <span className="category-chip">오픈소스</span>}</div><h1>{trend.name}</h1><p>{trend.tagline}</p></div></div>
        <div className="detail-scores"><div><span>Trend Score</span><strong>{trend.trendScore}</strong><small>오늘 #{trend.rank}</small></div><div><span>Trust Score</span><strong>{trend.trustScore}</strong><small><ShieldCheck size={14} />신뢰도 높음</small></div></div>
        <div className="detail-actions"><a className="button button-primary" href={trend.canonicalUrl} target="_blank" rel="noreferrer" data-ga-event="click_outbound" data-ga-params={JSON.stringify({ target: "official_site", service_slug: trend.slug, link_url: trend.canonicalUrl })}>공식 사이트 <ArrowUpRight size={17} /></a>{trend.githubUrl && <a className="button button-secondary" href={trend.githubUrl} target="_blank" rel="noreferrer" data-ga-event="click_outbound" data-ga-params={JSON.stringify({ target: "github", service_slug: trend.slug, link_url: trend.githubUrl })}><GitBranch size={17} />GitHub</a>}<Link className="button button-secondary" href={`/compare?slugs=${trend.slug}` as Route} data-ga-event="add_to_compare" data-ga-params={JSON.stringify({ service_slug: trend.slug, trigger: "detail" })}><GitCompareArrows size={17} />비교하기</Link><WatchButton entityId={trend.id} slug={trend.slug} initialSaved={savedEntityIds.has(trend.id)} /></div>
      </section>

      <section className="ai-analysis">
        <div className="analysis-label"><Sparkles size={17} /><span>AI 분석</span><small>수집 신호 기반 · {new Date(trend.updatedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</small></div>
        <h2>왜 지금 뜨고 있나요?</h2>
        <p>{trend.description}</p>
        <ol>{trend.whyTrending.map((reason, index) => <li key={reason}><span>{index + 1}</span>{reason}</li>)}</ol>
        <p className="analysis-disclaimer">AI가 수집된 출처를 요약한 내용이며, 가격·라이선스 등 사실 정보는 공식 사이트에서 재확인하세요.</p>
      </section>

      <section className="detail-grid">
        <article className="panel trend-panel"><div className="panel-heading"><div><h2>트렌드 신호</h2></div></div><TrendPeriodChart history={scoreHistory} name={trend.name} slug={trend.slug} nowIso={nowIso} /></article>
        <article className="panel platform-panel"><div className="panel-heading"><div><h2>플랫폼별 지표</h2></div></div>{trend.signals.map((signal) => <div className="platform-row" key={signal.source}><SourceBrandIcon source={signal.source} size="medium" /><span><strong>{signal.label}</strong><small><Clock3 size={12} />{formatCollectedAt(signal.measuredAt)} 수집 · {signal.reliability === "verified" ? "검증됨" : "추정"}</small></span><span><strong>{signal.value.toLocaleString("ko-KR")}</strong><em>+{signal.delta24h.toLocaleString("ko-KR")}</em></span></div>)}</article>
      </section>

      <section className="reaction-grid">
        <article className="panel reaction-positive"><div className="panel-heading"><h2><CheckCircle2 size={19} />사용자가 좋아하는 점</h2></div><ul>{trend.strengths.map((item) => <li key={item}>{item}</li>)}</ul></article>
        <article className="panel reaction-negative"><div className="panel-heading"><h2><TriangleAlert size={19} />불만 및 우려</h2></div><ul>{trend.weaknesses.map((item) => <li key={item}>{item}</li>)}</ul></article>
      </section>

      <section className="panel source-section"><div className="panel-heading"><div><h2>주요 출처</h2></div><span>독립 출처 {trend.sources.length}개</span></div>{trend.sources.map((source) => { const href = source === "github" && trend.githubUrl ? trend.githubUrl : trend.canonicalUrl; return <a className="source-row" key={source} href={href} target="_blank" rel="noreferrer" data-ga-event="click_outbound" data-ga-params={JSON.stringify({ target: "source", source_channel: source, service_slug: trend.slug, link_url: href })}><SourceBrandIcon source={source} size="medium" /><span><strong>{getSourceLabel(source)}</strong><small>{source === "github" ? "공개 GitHub 저장소에서 감지된 신호" : "공개 커뮤니티 토론에서 감지된 신호"}</small></span><ExternalLink size={17} /></a>; })}</section>

      <section className="insight-grid"><article className="panel"><Users size={20} /><h2>추천 대상</h2><ul>{trend.targetUsers.map((item) => <li key={item}>{item}</li>)}</ul></article><article className="panel"><GitBranch size={20} /><h2>활용 사례</h2><ul>{trend.useCases.map((item) => <li key={item}>{item}</li>)}</ul></article><article className="panel opportunity"><Sparkles size={20} /><h2>국내 적용 기회</h2><p>{trend.koreaOpportunity}</p></article></section>
    </div>
  );
}
