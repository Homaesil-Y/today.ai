import type { TrendScoreBreakdown, TrendStatus } from "@ai-trend-radar/types";

export const SCORING_VERSION = "v1";

const limits: TrendScoreBreakdown = {
  crossSource: 25,
  velocity: 20,
  productGrowth: 15,
  threads: 12,
  reddit: 10,
  novelty: 8,
  instagram: 5,
  quality: 5,
};

const clamp = (value: number, max: number) => Math.min(max, Math.max(0, value));

export function calculateTrendScore(input: TrendScoreBreakdown): number {
  const score = (Object.keys(limits) as (keyof TrendScoreBreakdown)[]).reduce(
    (total, key) => total + clamp(input[key], limits[key]),
    0,
  );
  return Math.round(score * 10) / 10;
}

export function calculateStatus(params: {
  firstDetectedHours: number;
  velocityDelta: number;
  score: number;
  previousScore: number;
  dataPoints: number;
}): TrendStatus {
  const { firstDetectedHours, velocityDelta, score, previousScore, dataPoints } = params;
  if (dataPoints < 2) return "WATCH";
  if (firstDetectedHours <= 24) return "NEW";
  if (velocityDelta >= 25 || score >= 85) return "SURGING";
  if (score >= 80 && Math.abs(score - previousScore) < 3) return "PEAK";
  if (score - previousScore >= 5) return "RISING";
  if (previousScore - score >= 8) return "FALLING";
  if (previousScore < 45 && score >= 60) return "REVIVAL";
  return "STABLE";
}

export function canonicalizeUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";
  [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "ref",
    "source",
  ].forEach((key) => url.searchParams.delete(key));
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  url.searchParams.sort();
  return url.toString();
}
