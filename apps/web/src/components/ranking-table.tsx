import type { TrendEntity } from "@ai-trend-radar/types";
import { ArrowUp, ChevronRight } from "lucide-react";
import Link from "next/link";
import { Sparkline } from "./sparkline";
import { getSourceLabel, SourceBrandIcon } from "./source-brand-icon";
import { StatusBadge } from "./status-badge";
import { WatchButton } from "./watch-button";

export function RankingTable({ trends, savedEntityIds = new Set<string>() }: { trends: TrendEntity[]; savedEntityIds?: Set<string> }) {
  return (
    <div className="ranking-wrap">
      <table className="ranking-table">
        <thead><tr><th>순위</th><th>서비스</th><th>상태</th><th className="numeric">점수</th><th>최근 흐름</th><th>채널</th><th className="numeric">24H 변화</th><th><span className="sr-only">액션</span></th></tr></thead>
        <tbody>
          {trends.map((trend) => (
            <tr key={trend.id}>
              <td className="rank-cell"><strong>{String(trend.rank).padStart(2, "0")}</strong><span className={trend.rankChange < 0 ? "negative" : "positive"}>{trend.rankChange === 0 ? "—" : `${trend.rankChange > 0 ? "▲" : "▼"} ${Math.abs(trend.rankChange)}`}</span></td>
              <td><Link className="table-service" href={`/services/${trend.slug}`}><span><strong>{trend.name}</strong><small>{trend.category}</small></span></Link></td>
              <td><StatusBadge status={trend.status} /></td>
              <td className="numeric score-cell">{trend.trendScore}</td>
              <td><Sparkline values={trend.sparkline} label={`${trend.name} 트렌드 변화`} /></td>
              <td><div className="source-pills" aria-label={`수집 채널 ${trend.sources.map(getSourceLabel).join(", ")}`}>{trend.sources.slice(0, 4).map((source) => <SourceBrandIcon key={source} source={source} />)}</div></td>
              <td className="numeric positive">{trend.signals[0]?.delta24h ? <><ArrowUp size={14} /> +{trend.signals[0].delta24h.toLocaleString("ko-KR")}</> : "초기 집계"}</td>
              <td><div className="row-actions"><WatchButton entityId={trend.id} compact initialSaved={savedEntityIds.has(trend.id)} /><Link className="icon-button" href={`/services/${trend.slug}`} aria-label={`${trend.name} 상세 보기`}><ChevronRight size={18} /></Link></div></td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mobile-ranking">
        {trends.map((trend) => (
          <Link href={`/services/${trend.slug}`} className="mobile-rank-card" key={trend.id}>
            <span className="mobile-rank">
              <strong>{String(trend.rank).padStart(2, "0")}</strong>
              <em className={trend.rankChange === 0 ? "" : trend.rankChange > 0 ? "positive" : "negative"}>{trend.rankChange === 0 ? "—" : `${trend.rankChange > 0 ? "▲" : "▼"}${Math.abs(trend.rankChange)}`}</em>
            </span>
            <span className="mobile-service">
              <strong>{trend.name}</strong>
              <span className="mobile-meta">
                <StatusBadge status={trend.status} />
                <span className="mobile-sources" aria-label={`수집 채널 ${trend.sources.map(getSourceLabel).join(", ")}`}>{trend.sources.slice(0, 3).map((source) => <SourceBrandIcon key={source} source={source} />)}</span>
                {trend.signals[0]?.delta24h ? <span className="mobile-delta positive">+{trend.signals[0].delta24h.toLocaleString("ko-KR")}</span> : <span className="mobile-delta">초기 집계</span>}
              </span>
            </span>
            <span className="mobile-score">{trend.trendScore}<small>점</small></span>
          </Link>
        ))}
      </div>
    </div>
  );
}
