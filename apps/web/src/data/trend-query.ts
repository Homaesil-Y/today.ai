import type { SourceCode, TrendEntity } from "@ai-trend-radar/types";

export type TrendSort = "score" | "trust" | "recent" | "name";
export type TrendPeriod = "all" | "today" | "7d" | "30d";

export interface TrendQuery {
  q?: string;
  category?: string;
  source?: string;
  sort?: string;
  minTrust?: string | number;
  period?: string;
}

function normalize(value: string) {
  return value.trim().toLocaleLowerCase("ko-KR");
}

// 순위 부여(live-trends)와 탐색 기본 정렬이 동일한 순서를 내도록 쓰는 공유 비교자.
// 점수 → 신뢰도 → 이름 순의 완전 결정적 tiebreak라 순위 번호가 목록 순서와 항상 일치한다.
export function compareByScore(a: TrendEntity, b: TrendEntity) {
  return b.trendScore - a.trendScore || b.trustScore - a.trustScore || a.name.localeCompare(b.name, "ko-KR");
}

export function filterAndSortTrends(trends: TrendEntity[], query: TrendQuery, now = new Date()) {
  const keyword = normalize(query.q ?? "");
  const category = normalize(query.category ?? "");
  const source = query.source as SourceCode | undefined;
  const minimumTrust = Math.min(100, Math.max(0, Number(query.minTrust) || 0));
  const period = (["today", "7d", "30d"].includes(query.period ?? "") ? query.period : "all") as TrendPeriod;
  const periodMs = period === "today" ? 86_400_000 : period === "7d" ? 604_800_000 : period === "30d" ? 2_592_000_000 : null;

  const filtered = trends.filter((trend) => {
    const haystack = normalize([trend.name, trend.tagline, trend.description, trend.category, trend.canonicalUrl, trend.githubUrl ?? ""].join(" "));
    if (keyword && !haystack.includes(keyword)) return false;
    if (category && normalize(trend.category) !== category) return false;
    if (source && !trend.sources.includes(source)) return false;
    if (trend.trustScore < minimumTrust) return false;
    if (periodMs && now.getTime() - new Date(trend.updatedAt).getTime() > periodMs) return false;
    return true;
  });

  const sort = (["trust", "recent", "name"].includes(query.sort ?? "") ? query.sort : "score") as TrendSort;
  return [...filtered].sort((a, b) => {
    if (sort === "trust") return b.trustScore - a.trustScore || b.trendScore - a.trendScore;
    if (sort === "recent") return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime() || b.trendScore - a.trendScore;
    if (sort === "name") return a.name.localeCompare(b.name, "ko-KR");
    return compareByScore(a, b);
  });
}

export function summarizeCategories(trends: TrendEntity[]) {
  const summary = new Map<string, { name: string; count: number; topScore: number; risingCount: number }>();
  for (const trend of trends) {
    const current = summary.get(trend.category) ?? { name: trend.category, count: 0, topScore: 0, risingCount: 0 };
    current.count += 1;
    current.topScore = Math.max(current.topScore, trend.trendScore);
    if (["RISING", "SURGING", "PEAK"].includes(trend.status)) current.risingCount += 1;
    summary.set(trend.category, current);
  }
  return [...summary.values()].sort((a, b) => b.count - a.count || b.topScore - a.topScore || a.name.localeCompare(b.name, "ko-KR"));
}

