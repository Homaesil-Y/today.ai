import type { TrendStatus } from "@ai-trend-radar/types";

const labels: Record<TrendStatus, string> = {
  NEW: "오늘 처음 발견",
  RISING: "상승 중",
  SURGING: "24시간 급상승",
  PEAK: "관심 정점",
  STABLE: "관심 유지",
  FALLING: "하락 중",
  REVIVAL: "재상승",
  WATCH: "관찰 대상",
};

export function StatusBadge({ status }: { status: TrendStatus }) {
  return <span className={`status-badge status-${status.toLowerCase()}`}>{labels[status]}</span>;
}
