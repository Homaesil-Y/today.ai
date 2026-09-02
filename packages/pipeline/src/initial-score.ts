import { calculateStatus, calculateTrendScore, engagementSignal, SCORING_VERSION } from "@ai-trend-radar/scoring";
import type { TrendScoreBreakdown } from "@ai-trend-radar/types";
import type { ScoreDistributions } from "./engagement-percentile";
import type { EntityCandidate } from "./schema";

/**
 * 후보 하나가 자기 채널에서 내세우는 반응 지표(HN points, PH votes, Reddit upvotes, GitHub stars).
 *
 * 채널마다 필드명이 달라 전부 본다. velocity 는 채널 내 백분위라 척도 차이는 자동으로 흡수된다
 * (HN 중앙 2 · PH 중앙 194 · GitHub 스타 중앙 423). GitHub 스타를 여기 넣은 이유: v2 까지는 별도
 * productGrowth 축(절대 스타 수의 로그)으로만 반영됐는데, 그 축은 상한 15라 GitHub 단독 엔티티가
 * velocity·comments 를 전혀 못 받은 채 총점 ~35에 묶였다 — 1만 스타 저장소도 상위 50위(커트라인
 * ~30)에 못 들어갔다. 채널 내 백분위로 넣으면 다른 채널과 같은 규칙으로 경쟁한다.
 * Reddit 업보트도 같은 이유로 포함한다(전용 reddit 축은 채널이 막혀 상한 0).
 */
export function engagementValue(candidate: EntityCandidate) {
  const { points, votes, score, stars } = candidate.metrics;
  return Math.max(0, points ?? 0, votes ?? 0, score ?? 0, stars ?? 0);
}

/**
 * 후보의 토론 깊이 지표(댓글 수, GitHub 은 이슈 수).
 *
 * 수집 시점부터 저장해 왔지만 v1 까지 점수에 쓰인 적이 없다. 반응 크기와는 독립적인 신호다 — 500점에
 * 댓글 2개인 항목과 50점에 댓글 300개인 항목은 성격이 다르다. 실측(793건)으로 이 축을 넣으면
 * 대형 동점 그룹이 30% → 13% 로 줄었다. GitHub 은 댓글이 없어 이슈 수를 같은 성격의 신호로 쓴다
 * (77% 비영, 중앙 4).
 */
export function commentValue(candidate: EntityCandidate) {
  const { comments, issues } = candidate.metrics;
  return Math.max(0, comments ?? 0, issues ?? 0);
}

/**
 * 이 파이프라인이 `trend_scores.scoring_version` 에 기록하는 값.
 *
 * 이력 비교(loadScoreHistory)가 이 값으로 같은 척도끼리만 필터링하므로, 점수 공식이 바뀌면
 * scoring 패키지의 SCORING_VERSION 이 올라가고 이 값도 함께 바뀐다.
 */
export const BOOTSTRAP_SCORING_VERSION = `${SCORING_VERSION}-bootstrap`;

/** scoring 패키지의 limits 와 같아야 한다. */
export const VELOCITY_CAP = 40;
export const COMMENTS_CAP = 20;
export const CROSS_SOURCE_CAP = 20;

/**
 * 순위에 넣기 위한 최소 반응 신호(engagementSignal).
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
  return engagementSignal(breakdown) >= RANKING_SIGNAL_FLOOR;
}

/**
 * 반응 지표의 반감기(일). 수집된 지 이만큼 지나면 velocity·comments·crossSource 기여가 절반이 된다.
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
 * 비교 가능성은 유지된다. 상한 40 기준으로 중앙값 10, 상위 10% 32.4, 상위 1% 39.2 가 된다.
 */
export function velocityFromRank(rank: number) {
  return rankToScore(rank, VELOCITY_CAP);
}

/** 백분위를 축 점수로 옮긴다. velocity 와 같은 제곱 곡선을 쓴다(꼬리 강조). */
export function rankToScore(rank: number, cap: number) {
  const bounded = Math.min(1, Math.max(0, rank));
  return Math.round(bounded * bounded * cap * 10) / 10;
}

/** 이 엔티티의 과거 스냅샷 요약. 없으면 상태는 WATCH(또는 NEW)로 남는다. */
export interface EntityScoreHistory {
  /** 직전(오늘 이전, 같은 척도) 스냅샷의 반응 신호(engagementSignal). */
  previousSignal: number;
  /** 이번 스냅샷을 포함한 누적 스냅샷 수. calculateStatus 는 2 이상부터 판정한다. */
  dataPoints: number;
}

export function calculateInitialTrendScore(
  candidates: EntityCandidate[],
  now: Date,
  distributions?: ScoreDistributions,
  history?: EntityScoreHistory,
) {
  // 반응 축은 후보별로 계산한 뒤 감쇠를 곱하고 최대값을 취한다 — 신선하고 강한 언급이 오래된
  // 더 강한 언급을 자연스럽게 이긴다. 감쇠는 축 변환 이후에 곱해야 한다: 백분위는 상대 순위라
  // 원시값을 일괄 감쇠해도 순위가 그대로다.
  const decayOf = (candidate: EntityCandidate) => recencyDecay(candidate.lastDetectedAt, now);
  const decayed = (contribution: (candidate: EntityCandidate) => number) =>
    Math.round(Math.max(0, ...candidates.map((candidate) => contribution(candidate) * decayOf(candidate))) * 10) / 10;
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
  // 교차 채널. 채널마다 가장 신선한 언급의 감쇠를 무게로 쓰고, 가장 강한 채널 하나를 뺀 나머지를
  // 더한다(채널 하나 = 상한의 1/3, 3개 채널에서 상한). v2 까지는 감쇠하지 않아 몇 주 전 교차 언급이
  // 6.7점을 영구히 유지했다 — 반응 축 중 유일하게 시간이 흐르지 않는 축이었다.
  const freshestBySource = new Map<string, number>();
  for (const candidate of candidates) {
    const decay = decayOf(candidate);
    if (decay > (freshestBySource.get(candidate.source) ?? 0)) freshestBySource.set(candidate.source, decay);
  }
  const extraSources = [...freshestBySource.values()].sort((a, b) => b - a).slice(1);
  const crossSource = Math.round(Math.min(CROSS_SOURCE_CAP, extraSources.reduce((sum, decay) => sum + decay, 0) * (CROSS_SOURCE_CAP / 3)) * 10) / 10;

  const firstDetected = Math.min(...candidates.map((candidate) => new Date(candidate.firstDetectedAt).getTime()));
  const ageHours = Math.max(0, (now.getTime() - firstDetected) / 3_600_000);
  const bestDescription = candidates.map((candidate) => candidate.description ?? "").sort((a, b) => b.length - a.length)[0] ?? "";

  const breakdown: TrendScoreBreakdown = {
    crossSource,
    velocity,
    comments,
    // GitHub 스타는 velocity 로 흡수됐다(engagementValue 참고). scoring 의 limits 도 0 이다.
    productGrowth: 0,
    // 수집 경로가 막힌 채널. scoring 의 limits 가 0 이라 값을 넣어도 반영되지 않는다.
    threads: 0,
    reddit: 0,
    // 발견 후 경과. 순위에는 들어가지만 상태 판정에는 쓰지 않는다 — 계단이 내려가는 날 FALLING 이
    // 붙는 것을 막기 위해서다(scoring 의 engagementSignal 참고).
    novelty: ageHours <= 24 ? 15 : ageHours <= 24 * 7 ? 11.3 : ageHours <= 24 * 30 ? 5.6 : 1.9,
    instagram: 0,
    // 설명 완결성. 트렌드 신호가 아니라 동점 정리용이므로 단계 간 차이를 1점으로 둔다.
    quality: bestDescription.length >= 80 ? 5 : bestDescription.length >= 20 ? 4 : 3,
  };
  const totalScore = calculateTrendScore(breakdown);
  const signal = engagementSignal(breakdown);
  // 이력이 없으면 dataPoints 1을 넘겨 WATCH(24시간 이내면 NEW)가 되게 한다.
  const status = calculateStatus({
    firstDetectedHours: ageHours,
    signal,
    previousSignal: history?.previousSignal ?? signal,
    dataPoints: history ? history.dataPoints : 1,
  });
  const sources = new Set(candidates.map((candidate) => candidate.source));
  const averageConfidence = candidates.reduce((sum, candidate) => sum + candidate.confidence, 0) / candidates.length;
  const trustScore = Math.round(Math.min(95, 45 + averageConfidence * 40 + Math.min(10, sources.size * 5)));

  return { breakdown, totalScore, status, trustScore, ranked: isRankable(breakdown), scoringVersion: BOOTSTRAP_SCORING_VERSION };
}
