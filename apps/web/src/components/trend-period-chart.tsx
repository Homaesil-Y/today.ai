"use client";

import { ArrowUpRight } from "lucide-react";
import { useMemo, useState } from "react";

type Point = { measuredAt: string; score: number };
type PeriodKey = "24h" | "7d" | "30d" | "90d";

const PERIODS: { key: PeriodKey; label: string; hours: number }[] = [
  { key: "24h", label: "24H", hours: 24 },
  { key: "7d", label: "7D", hours: 24 * 7 },
  { key: "30d", label: "30D", hours: 24 * 30 },
  { key: "90d", label: "90D", hours: 24 * 90 },
];

const WIDTH = 120;
const HEIGHT = 36;

function projectPoints(points: Point[], windowStart: number, windowEnd: number) {
  const scores = points.map((p) => p.score);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const range = Math.max(1, max - min);
  const span = Math.max(1, windowEnd - windowStart);
  return points
    .map((p) => {
      const t = new Date(p.measuredAt).getTime();
      const x = ((t - windowStart) / span) * WIDTH;
      const y = HEIGHT - ((p.score - min) / range) * (HEIGHT - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

// 실제 스냅샷(trend_scores) 이력을 시간축 기준으로 배치해 그리는 기간별 차트.
// 데이터가 부족한 기간은 있는 그대로("스냅샷 N개")를 보여주고, 없는 값을 지어내지 않는다.
export function TrendPeriodChart({ history, name, nowIso }: { history: Point[]; name: string; nowIso: string }) {
  const [period, setPeriod] = useState<PeriodKey>("7d");
  const now = useMemo(() => new Date(nowIso).getTime(), [nowIso]);
  const active = PERIODS.find((p) => p.key === period)!;
  const windowStart = now - active.hours * 3600_000;
  const filtered = history.filter((p) => new Date(p.measuredAt).getTime() >= windowStart);
  const latestScore = history.at(-1)?.score;

  return (
    <>
      <div className="period-tabs" aria-label="그래프 기간" role="tablist">
        {PERIODS.map((p) => (
          <button key={p.key} type="button" role="tab" aria-selected={p.key === period} className={p.key === period ? "active" : ""} onClick={() => setPeriod(p.key)}>
            {p.label}
          </button>
        ))}
      </div>
      <div className="large-chart">
        <div className="chart-grid" aria-hidden="true" />
        {filtered.length >= 2 ? (
          <svg className="sparkline" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={`${name} ${active.label} 트렌드 점수 추이`}>
            <polyline points={projectPoints(filtered, windowStart, now)} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          </svg>
        ) : (
          <p className="chart-empty">
            {filtered.length === 1
              ? `${active.label} 구간에는 스냅샷이 1개뿐이라 추세선을 그릴 수 없습니다.`
              : `${active.label} 구간에는 아직 수집된 스냅샷이 없습니다.`}
          </p>
        )}
      </div>
      <p className="chart-summary">
        <ArrowUpRight size={16} aria-hidden="true" />
        <span>
          {latestScore === undefined
            ? "아직 점수 스냅샷이 없습니다."
            : <>현재 최신 트렌드 점수는 <strong>{latestScore}</strong>입니다. {active.label} 구간 스냅샷 {filtered.length}개 기준입니다.</>}
        </span>
      </p>
    </>
  );
}
