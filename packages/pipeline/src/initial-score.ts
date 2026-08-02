import { calculateStatus, calculateTrendScore, SCORING_VERSION } from "@ai-trend-radar/scoring";
import type { TrendScoreBreakdown } from "@ai-trend-radar/types";
import type { EntityCandidate } from "./schema";

function cappedLog(value: number, cap: number, scale: number) {
  if (value <= 0) return 0;
  return Math.min(cap, Math.round(Math.log10(value + 1) * scale * 10) / 10);
}

export function calculateInitialTrendScore(
  candidates: EntityCandidate[],
  now: Date,
) {
  const sources = new Set(candidates.map((candidate) => candidate.source));
  const stars = Math.max(0, ...candidates.map((candidate) => candidate.metrics.stars ?? 0));
  const hnPoints = Math.max(0, ...candidates.map((candidate) => candidate.metrics.points ?? 0));
  // Product Hunt는 추천(votes)으로 같은 종류의 "즉각적인 반응 크기"를 나타낸다. HN의 points와
  // 척도가 비슷해(수십~수천) 같은 velocity 축에 합산한다. 예전엔 여기서 points만 읽어서 순수
  // Product Hunt 엔티티는 velocity_score가 항상 0으로 고정돼 "초기 집계"만 영원히 표시됐다.
  const phVotes = Math.max(0, ...candidates.map((candidate) => candidate.metrics.votes ?? 0));
  const engagementScore = Math.max(hnPoints, phVotes);
  // Reddit 업보트는 전용 reddit 축(가중치 10)이 이미 스키마에 있는데도 계속 0으로 고정돼 있었다.
  const redditScore = Math.max(0, ...candidates.map((candidate) => candidate.metrics.score ?? 0));
  const firstDetected = Math.min(...candidates.map((candidate) => new Date(candidate.firstDetectedAt).getTime()));
  const ageHours = Math.max(0, (now.getTime() - firstDetected) / 3_600_000);
  const bestDescription = candidates.map((candidate) => candidate.description ?? "").sort((a, b) => b.length - a.length)[0] ?? "";

  const breakdown: TrendScoreBreakdown = {
    crossSource: Math.min(25, Math.max(0, sources.size - 1) * 8),
    velocity: cappedLog(engagementScore, 20, 5),
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
