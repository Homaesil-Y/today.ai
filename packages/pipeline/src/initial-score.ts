import { calculateStatus, calculateTrendScore, SCORING_VERSION } from "@ai-trend-radar/scoring";
import type { TrendScoreBreakdown } from "@ai-trend-radar/types";
import type { ScoreDistributions } from "./engagement-percentile";
import type { EntityCandidate } from "./schema";

function cappedLog(value: number, cap: number, scale: number) {
  if (value <= 0) return 0;
  return Math.min(cap, Math.round(Math.log10(value + 1) * scale * 10) / 10);
}

/**
 * 후보 하나가 자기 채널에서 내세우는 반응 지표(HN points, PH votes, Reddit upvotes).
 *
 * 채널마다 필드명이 달라 전부 본다. velocity 는 채널 내 백분위라 척도 차이는 자동으로 흡수된다
 * (HN 중앙 2 대 PH 중앙 194). Reddit 업보트를 여기 포함한 이유: 예전엔 전용 reddit 축으로만
 * 반영됐는데 그 축은 채널이 막혀 상한 0 이다. 지금처럼 두면 Reddit 수집이 복구되는 날 모든
 * Reddit 항목이 반응 점수 0 을 받는다 — 채널이 돌아오는 순간 조용히 망가지는 함정이었다.
 */
export function engagementValue(candidate: EntityCandidate) {
  return Math.max(0, candidate.metrics.points ?? 0, candidate.metrics.votes ?? 0, candidate.metrics.score ?? 0);
}

/**
 * 후보의 토론 깊이 지표(댓글 수).
 *
 * 수집 시점부터 저장해 왔지만 점수에 쓰인 적이 없다. 반응 크기와는 독립적인 신호다 — 500점에
 * 댓글 2개인 항목과 50점에 댓글 300개인 항목은 성격이 다르다. 실측(793건)으로 이 축을 넣으면
 * 대형 동점 그룹이 30% → 13% 로 줄었다.
 */
export function commentValue(candidate: EntityCandidate) {
  return Math.max(0, candidate.metrics.comments ?? 0);
}

/**
 * 이 파이프라인이 `trend_scores.scoring_version` 에 기록하는 값.
 *
 * 이력 비교(loadScoreHistory)가 이 값으로 같은 척도끼리만 필터링하므로, 점수 공식이 바뀌면
 * scoring 패키지의 SCORING_VERSION 이 올라가고 이 값도 함께 바뀐다.
 */
export const BOOTSTRAP_SCORING_VERSION = `${SCORING_VERSION}-bootstrap`;

export const VELOCITY_CAP = 30;

/** 토론 깊이 축 상한. scoring 패키지의 limits.comments 와 같아야 한다. */
export const COMMENTS_CAP = 15;

/**
 * 순위에 넣기 위한 최소 반응 신호(velocity + comments + productGrowth + crossSource).
 *
 * 이 하한이 없으면 순위 하위 절반이 임의 순서가 된다. 실측(2026-08-25, 공개 793건): 459건(58%)이
 * 대형 동점 그룹에 몰려 60건이 정확히 같은 점수를 받았다. 공식 문제가 아니라 입력 문제다 — HN 에
 * 2점·댓글 0으로 올라온 항목은 구분할 근거가 아예 없다.
 *
 * 하한을 0.5 로 둔 근거(같은 데이터):
 *   0   → 순위 793건, 대형 동점 13%, 최대 동점 40
 *   0.5 → 순위 521건, 대형 동점  0%, 최대 동점 16   ← 가장 적게 빼면서 동점 문제가 사라지는 지점
 *   1   → 순위 410건, 대형 동점  0%, 최대 동점  9
 *
 * 제외된 엔티티는 삭제하거나 숨기지 않는다. 검색·카테고리·상세 페이지에서는 그대로 보이고,
 * 순위표에만 나오지 않는다. 재수집으로 반응이 붙으면 자동으로 순위에 복귀한다.
 */
export const RANKING_SIGNAL_FLOOR = 0.5;

/** 이 스냅샷을 순위에 노출할지. 반응 신호 축의 합으로 판단한다(시간·설명 축은 제외). */
export function isRankable(breakdown: TrendScoreBreakdown) {
  const signal = breakdown.velocity + breakdown.comments + breakdown.productGrowth + breakdown.crossSource;
  return signal >= RANKING_SIGNAL_FLOOR;
}

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
 * 비교 가능성은 유지된다. 상한 30 기준으로 중앙값 7.5, 상위 10% 24.3, 상위 1% 29.4 가 된다.
 */
export function velocityFromRank(rank: number) {
  return rankToScore(rank, VELOCITY_CAP);
}

/** 백분위를 축 점수로 옮긴다. velocity 와 같은 제곱 곡선을 쓴다(꼬리 강조). */
export function rankToScore(rank: number, cap: number) {
  const bounded = Math.min(1, Math.max(0, rank));
  return Math.round(bounded * bounded * cap * 10) / 10;
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
  distributions?: ScoreDistributions,
  history?: EntityScoreHistory,
) {
  const sources = new Set(candidates.map((candidate) => candidate.source));
  // 반응 기반 축(velocity·comments·productGrowth)은 후보별로 계산한 뒤 감쇠를 곱하고 최대값을
  // 취한다 — 신선하고 강한 언급이 오래된 더 강한 언급을 자연스럽게 이긴다. 감쇠는 축 변환
  // 이후에 곱해야 한다: 백분위는 상대 순위라 원시값을 일괄 감쇠해도 순위가 그대로다.
  const decayed = (contribution: (candidate: EntityCandidate) => number) =>
    Math.round(Math.max(0, ...candidates.map((candidate) => contribution(candidate) * recencyDecay(candidate.lastDetectedAt, now))) * 10) / 10;
  // 상한(15)의 1/4.3 을 로그 배율로 둔다. 스타 1만 개 부근에서 상한에 닿는 기존 곡선을 유지한다.
  const productGrowth = decayed((candidate) => cappedLog(candidate.metrics.stars ?? 0, 15, 3.5));
  // 반응 크기는 채널 안에서의 상대 순위로 환산한다. HN points 와 PH votes 는 척도가 100배
  // 가까이 달라(실측 중앙값 2 대 194) 원시값을 같은 축에 넣으면 순위가 PH로 쏠렸다.
  // 자세한 배경은 engagement-percentile.ts 참고.
  const velocity = distributions
    ? decayed((candidate) => velocityFromRank(distributions.engagement.rank(candidate.source, engagementValue(candidate))))
    : 0;
  // 토론 깊이. 댓글 수도 채널별 척도가 달라(HN 중앙 0 · PH 중앙 22) 같은 백분위 방식을 쓴다.
  const comments = distributions
    ? decayed((candidate) => rankToScore(distributions.comments.rank(candidate.source, commentValue(candidate)), COMMENTS_CAP))
    : 0;
  const firstDetected = Math.min(...candidates.map((candidate) => new Date(candidate.firstDetectedAt).getTime()));
  const ageHours = Math.max(0, (now.getTime() - firstDetected) / 3_600_000);
  const bestDescription = candidates.map((candidate) => candidate.description ?? "").sort((a, b) => b.length - a.length)[0] ?? "";

  const breakdown: TrendScoreBreakdown = {
    // 채널 하나가 늘 때마다 상한(20)의 1/3 씩. 3개 채널에서 상한에 닿는다.
    crossSource: Math.min(20, Math.max(0, sources.size - 1) * (20 / 3)),
    velocity,
    comments,
    productGrowth,
    // 수집 경로가 막힌 채널. scoring 의 limits 가 0 이라 값을 넣어도 반영되지 않는다.
    threads: 0,
    reddit: 0,
    novelty: ageHours <= 24 ? 12 : ageHours <= 24 * 7 ? 9 : ageHours <= 24 * 30 ? 4.5 : 1.5,
    instagram: 0,
    quality: bestDescription.length >= 80 ? 8 : bestDescription.length >= 20 ? 4.8 : 1.6,
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

  return { breakdown, totalScore, status, trustScore, ranked: isRankable(breakdown), scoringVersion: BOOTSTRAP_SCORING_VERSION };
}
