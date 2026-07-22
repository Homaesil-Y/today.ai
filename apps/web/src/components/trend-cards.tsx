import type { TrendEntity } from "@ai-trend-radar/types";
import { ArrowUpRight, ExternalLink, TrendingUp } from "lucide-react";
import Link from "next/link";
import { Sparkline } from "./sparkline";
import { StatusBadge } from "./status-badge";
import { WatchButton } from "./watch-button";

export function TopOneCard({ trend, initialSaved = false }: { trend: TrendEntity; initialSaved?: boolean }) {
  return (
    <article className="top-card top-one">
      <div className="rank-kicker"><span>{String(trend.rank).padStart(2, "0")}</span><StatusBadge status={trend.status} /></div>
      <div className="top-one-main">
        <div className="service-heading"><div><p className="eyebrow">{trend.category}</p><h3>{trend.name}</h3></div></div>
        <p className="tagline">{trend.tagline}</p>
        <ul className="reason-list">
          {trend.whyTrending.slice(0, 2).map((reason) => <li key={reason}><TrendingUp size={15} aria-hidden="true" />{reason}</li>)}
        </ul>
      </div>
      <div className="score-block"><span>Trend Score</span><strong>{trend.trendScore}</strong><small>신뢰도 {trend.trustScore}</small></div>
      <div className="signal-strip">
        {trend.signals.slice(0, 2).map((signal) => <div key={signal.source}><span>{signal.label}</span><strong>{signal.delta24h === 0 ? "초기 집계" : `+${signal.delta24h.toLocaleString("ko-KR")}`}</strong></div>)}
      </div>
      <div className="card-actions"><Link className="button button-primary" href={`/services/${trend.slug}`}>분석 보기 <ArrowUpRight size={17} /></Link><WatchButton entityId={trend.id} initialSaved={initialSaved} /></div>
    </article>
  );
}

export function TopSmallCard({ trend }: { trend: TrendEntity }) {
  return (
    <article className="top-card top-small">
      <div className="rank-kicker"><span>{String(trend.rank).padStart(2, "0")}</span><StatusBadge status={trend.status} /></div>
      <div className="service-heading"><div><p className="eyebrow">{trend.category}</p><h3>{trend.name}</h3></div></div>
      <p className="tagline">{trend.tagline}</p>
      <div className="mini-score"><div><span>Trend</span><strong>{trend.trendScore}</strong></div><Sparkline values={trend.sparkline} label={`${trend.name} 현재 트렌드 점수 ${trend.trendScore}`} /></div>
      <div className="small-card-footer"><span>{trend.rankChange === 0 ? "초기 집계" : `${trend.rankChange > 0 ? "▲" : "▼"} ${Math.abs(trend.rankChange)}위`}</span><Link href={`/services/${trend.slug}`} aria-label={`${trend.name} 상세 보기`}><ExternalLink size={17} /></Link></div>
    </article>
  );
}
