import { calculateStatus, calculateTrendScore, SCORING_VERSION } from "@ai-trend-radar/scoring";
import type { TrendScoreBreakdown } from "@ai-trend-radar/types";
import type { EngagementPercentiles } from "./engagement-percentile";
import type { EntityCandidate } from "./schema";

function cappedLog(value: number, cap: number, scale: number) {
  if (value <= 0) return 0;
  return Math.min(cap, Math.round(Math.log10(value + 1) * scale * 10) / 10);
}

/** 후보 하나가 자기 채널에서 내세우는 반응 지표(HN points, PH votes). */
export function engagementValue(candidate: EntityCandidate) {
  return Math.max(0, candidate.metrics.points ?? 0, candidate.metrics.votes ?? 0);
}

export const VELOCITY_CAP = 20;

/**
 * 채널 내 백분위(0~1)를 velocity 점수(0~VELOCITY_CAP)로 옮긴다.
 *
 * 선형이 아니라 제곱을 쓴다. 백분위만 쓰면 크기 정보가 통째로 사라져 824점짜리 HN 게시물과
 * 40점짜리가 "둘 다 상위권"으로 뭉뚱그려지는데, 원시 분포는 꼬리가 매우 길다(HN 중앙값 2,
 * 최대 824). 제곱하면 예전 로그 공식이 주던 꼬리 강조를 어느 정도 되살리면서도 채널 간
 * 비교 가능성은 유지된다. 중앙값 5.0, 상위 10% 16.2, 상위 1% 19.6 정도가 된다.
 */
export function velocityFromRank(rank: number) {
  const bounded = Math.min(1, Math.max(0, rank));
  return Math.round(bounded * bounded * VELOCITY_CAP * 10) / 10;
}

export function calculateInitialTrendScore(
  candidates: EntityCandidate[],
  now: Date,
  percentiles?: EngagementPercentiles,
) {
  const sources = new Set(candidates.map((candidate) => candidate.source));
  const stars = Math.max(0, ...candidates.map((candidate) => candidate.metrics.stars ?? 0));
  // 반응 크기는 채널 안에서의 상대 순위로 환산한다. HN points 와 PH votes 는 척도가 100배
  // 가까이 달라(실측 중앙값 2 대 194) 원시값을 같은 축에 넣으면 순위가 PH로 쏠렸다.
  // 자세한 배경은 engagement-percentile.ts 참고.
  const engagementRank = percentiles
    ? Math.max(0, ...candidates.map((candidate) => percentiles.rank(candidate.source, engagementValue(candidate))))
    : 0;
  // Reddit 업보트는 전용 reddit 축(가중치 10)이 이미 스키마에 있는데도 계속 0으로 고정돼 있었다.
  const redditScore = Math.max(0, ...candidates.map((candidate) => candidate.metrics.score ?? 0));
  const firstDetected = Math.min(...candidates.map((candidate) => new Date(candidate.firstDetectedAt).getTime()));
  const ageHours = Math.max(0, (now.getTime() - firstDetected) / 3_600_000);
  const bestDescription = candidates.map((candidate) => candidate.description ?? "").sort((a, b) => b.length - a.length)[0] ?? "";

  const breakdown: TrendScoreBreakdown = {
    crossSource: Math.min(25, Math.max(0, sources.size - 1) * 8),
    velocity: velocityFromRank(engagementRank),
    productGrowth: cappedLog(stars, 15, 3.5),
    threads: 0,
    reddit: cappedLog(redditScore, 10, 3),
    novelty: ageHours <= 24 ? 8 : ageHours <= 24 * 7 ? 6 : ageHours <= 24 * 30 ? 3 : 1,
    instagram: 0,
    quality: bestDescription.length >= 80 ? 5 : bestDescription.length >= 20 ? 3 : 1,
  };
  const totalScore = calculateTrendScore(breakdown);
  const status = calculateStatus({
    firstDetectedHours: ageHours,
    velocityDelta: 0,
    score: totalScore,
    previousScore: totalScore,
    dataPoints: 1,
  });
  const averageConfidence = candidates.reduce((sum, candidate) => sum + candidate.confidence, 0) / candidates.length;
  const trustScore = Math.round(Math.min(95, 45 + averageConfidence * 40 + Math.min(10, sources.size * 5)));

  return { breakdown, totalScore, status, trustScore, scoringVersion: `${SCORING_VERSION}-bootstrap` };
}
