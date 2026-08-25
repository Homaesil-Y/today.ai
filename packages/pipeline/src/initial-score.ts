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
 * 반응 지표의 반감기(일). 수집된 지 이만큼 지나면 velocity·productGrowth·reddit 기여가 절반이 된다.
 *
 * 이게 없으면 순위가 멈춘다. 반응 지표는 "그 항목이 마지막으로 수집된 시점"의 값에 얼어붙는데
 * (재수집되면 collected_at 과 지표가 함께 갱신된다), 원본 1,769건 중 최근 24시간 수집분은
 * 176건뿐이라 대부분의 엔티티가 몇 주 전 지표로 매일 똑같이 채점됐다. 실측(8/24→8/25):
 * 점수 변화 중앙값 0, 66%가 완전 동일, 상위 50위 교체 7건, RISING·FALLING 0건.
 *
 * 반감기 7일 시뮬레이션(같은 데이터, 하루 간격 재현): 상위 50위 교체 32건, FALLING 27건.
 * 3일은 교체 38건으로 과격하고(주말 수집 공백에 취약), 14일은 25건으로 미지근해 7일을 골랐다.
 * "지금 뜨는 것"을 보여주는 사이트 성격상, 재수집이 끊긴 항목은 일주일 단위로 무게가 줄어
 * 신선한 항목에게 자리를 내주는 게 맞다.
 */
export const ENGAGEMENT_HALF_LIFE_DAYS = 7;

/** lastDetectedAt(=collected_at) 이후 경과일에 따른 감쇠 배율(0~1). 시각이 깨져 있으면 감쇠하지 않는다. */
export function recencyDecay(lastDetectedAt: string, now: Date) {
  const ageDays = (now.getTime() - new Date(lastDetectedAt).getTime()) / 86_400_000;
  if (!Number.isFinite(ageDays) || ageDays <= 0) return 1;
  return 2 ** (-ageDays / ENGAGEMENT_HALF_LIFE_DAYS);
}

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

/** 이 엔티티의 과거 점수 스냅샷 요약. 없으면 상태는 WATCH 로 남는다. */
export interface EntityScoreHistory {
  /** 직전(오늘 이전) 스냅샷의 총점. */
  previousScore: number;
  /** 이번 스냅샷을 포함한 누적 스냅샷 수. calculateStatus 는 2 이상부터 판정한다. */
  dataPoints: number;
}

export function calculateInitialTrendScore(
  candidates: EntityCandidate[],
  now: Date,
  percentiles?: EngagementPercentiles,
  history?: EntityScoreHistory,
) {
  const sources = new Set(candidates.map((candidate) => candidate.source));
  // 반응 기반 축(velocity·productGrowth·reddit)은 후보별로 계산한 뒤 감쇠를 곱하고 최대값을
  // 취한다 — 신선하고 강한 언급이 오래된 더 강한 언급을 자연스럽게 이긴다. 감쇠는 축 변환
  // 이후에 곱해야 한다: 백분위는 상대 순위라 원시값을 일괄 감쇠해도 순위가 그대로다.
  const decayed = (contribution: (candidate: EntityCandidate) => number) =>
    Math.round(Math.max(0, ...candidates.map((candidate) => contribution(candidate) * recencyDecay(candidate.lastDetectedAt, now))) * 10) / 10;
  const productGrowth = decayed((candidate) => cappedLog(candidate.metrics.stars ?? 0, 15, 3.5));
  // 반응 크기는 채널 안에서의 상대 순위로 환산한다. HN points 와 PH votes 는 척도가 100배
  // 가까이 달라(실측 중앙값 2 대 194) 원시값을 같은 축에 넣으면 순위가 PH로 쏠렸다.
  // 자세한 배경은 engagement-percentile.ts 참고.
  const velocity = percentiles
    ? decayed((candidate) => velocityFromRank(percentiles.rank(candidate.source, engagementValue(candidate))))
    : 0;
  // Reddit 업보트는 전용 reddit 축(가중치 10)이 이미 스키마에 있는데도 계속 0으로 고정돼 있었다.
  const reddit = decayed((candidate) => cappedLog(candidate.metrics.score ?? 0, 10, 3));
  const firstDetected = Math.min(...candidates.map((candidate) => new Date(candidate.firstDetectedAt).getTime()));
  const ageHours = Math.max(0, (now.getTime() - firstDetected) / 3_600_000);
  const bestDescription = candidates.map((candidate) => candidate.description ?? "").sort((a, b) => b.length - a.length)[0] ?? "";

  const breakdown: TrendScoreBreakdown = {
    crossSource: Math.min(25, Math.max(0, sources.size - 1) * 8),
    velocity,
    productGrowth,
    threads: 0,
    reddit,
    novelty: ageHours <= 24 ? 8 : ageHours <= 24 * 7 ? 6 : ageHours <= 24 * 30 ? 3 : 1,
    instagram: 0,
    quality: bestDescription.length >= 80 ? 5 : bestDescription.length >= 20 ? 3 : 1,
  };
  const totalScore = calculateTrendScore(breakdown);
  // 이력이 없으면 calculateStatus 가 WATCH 를 돌려주도록 dataPoints 1을 넘긴다. 예전엔 이 값이
  // 항상 1로 고정돼 있어서, 정의된 8개 상태 중 WATCH 를 제외한 7개가 도달 불가능했다
  // (실측: 공개 486건이 예외 없이 WATCH 라 화면의 상태 배지가 전부 "관찰 대상"이었다).
  const status = calculateStatus({
    firstDetectedHours: ageHours,
    // 직전 스냅샷 대비 점수 상승폭. 스냅샷이 하나뿐이면 비교 대상이 없어 0.
    velocityDelta: history ? totalScore - history.previousScore : 0,
    score: totalScore,
    previousScore: history?.previousScore ?? totalScore,
    dataPoints: history ? history.dataPoints : 1,
  });
  const averageConfidence = candidates.reduce((sum, candidate) => sum + candidate.confidence, 0) / candidates.length;
  const trustScore = Math.round(Math.min(95, 45 + averageConfidence * 40 + Math.min(10, sources.size * 5)));

  return { breakdown, totalScore, status, trustScore, scoringVersion: `${SCORING_VERSION}-bootstrap` };
}
