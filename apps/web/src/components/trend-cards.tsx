import type { TrendEntity } from "@ai-trend-radar/types";
import { ArrowUpRight, TrendingUp } from "lucide-react";
import Link from "next/link";
import { formatScoreDelta } from "@/lib/score-delta";
import { Sparkline } from "./sparkline";
import { StatusBadge } from "./status-badge";
import { WatchButton } from "./watch-button";

export function TopOneCard({ trend, initialSaved = false }: { trend: TrendEntity; initialSaved?: boolean }) {
  return (
    <article className="top-card top-one">
      <div className="rank-kicker"><span>{String(trend.rank).padStart(2, "0")}</span><StatusBadge status={trend.status} /></div>
      <div className="top-one-head">
        <div className="service-heading"><div><p className="eyebrow">{trend.category}</p><h3>{trend.name}</h3></div></div>
        <div className="score-block"><span>Trend Score</span><strong>{trend.trendScore}</strong><small>신뢰도 {trend.trustScore}</small></div>
      </div>
      <p className="tagline">{trend.tagline}</p>
      <ul className="reason-list">
        {trend.whyTrending.slice(0, 2).map((reason) => <li key={reason}><TrendingUp size={15} aria-hidden="true" />{reason}</li>)}
      </ul>
      <div className="signal-strip">
        {trend.signals.slice(0, 2).map((signal) => <div key={signal.source}><span>{signal.label}</span><strong className={formatScoreDelta(signal.delta24h).tone}>{formatScoreDelta(signal.delta24h).label}</strong></div>)}
      </div>
      <div className="card-actions"><Link className="button button-primary" href={`/services/${trend.slug}`} data-ga-event="select_content" data-ga-params={JSON.stringify({ content_type: "trend_card", service_slug: trend.slug, service_category: trend.category, position: trend.rank })}>분석 보기 <ArrowUpRight size={17} /></Link><WatchButton entityId={trend.id} slug={trend.slug} initialSaved={initialSaved} /></div>
    </article>
  );
}

export function TopSmallCard({ trend }: { trend: TrendEntity }) {
  return (
    <article className="top-card top-small">
      <div className="rank-kicker"><span>{String(trend.rank).padStart(2, "0")}</span><StatusBadge status={trend.status} /></div>
      <div className="service-heading"><div><p className="eyebrow">{trend.category}</p><h3>{trend.name}</h3></div></div>
      <p className="tagline">{trend.tagline}</p>
      <div className="mini-score"><div><span>Trend Score</span><strong>{trend.trendScore}</strong><small>신뢰도 {trend.trustScore}</small></div><Sparkline values={trend.sparkline} label={`${trend.name} 현재 트렌드 점수 ${trend.trendScore}`} /></div>
      <div className="small-card-footer"><span>{trend.rankChange === 0 ? "초기 집계" : `${trend.rankChange > 0 ? "▲" : "▼"} ${Math.abs(trend.rankChange)}위`}</span><Link className="card-detail-link" href={`/services/${trend.slug}`} data-ga-event="select_content" data-ga-params={JSON.stringify({ content_type: "trend_card", service_slug: trend.slug, service_category: trend.category, position: trend.rank })}>분석 보기 <ArrowUpRight size={15} aria-hidden="true" /></Link></div>
    </article>
  );
}
