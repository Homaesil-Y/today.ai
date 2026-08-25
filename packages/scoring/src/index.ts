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

/**
 * 상태 판정 임계값. 실측 분포에 맞춰 보정한 값이다.
 *
 * 원래 임계값(SURGING ≥85, PEAK ≥80, REVIVAL ≥60, RISING +5, FALLING -8)은 명목 100점 척도를
 * 전제했는데, 실제 점수는 그 1/3 척도에 산다 — 8축 중 threads·instagram·reddit 은 채널 미가동으로
 * 항상 0이고 crossSource 는 1%, productGrowth 는 2%의 엔티티만 갖는다(2026-08-25 실측: 793건 중
 * 최고 34.6, 중앙값 11). 그래서 SURGING/PEAK/REVIVAL 은 도달 가능한 점수가 존재하지 않았고,
 * FALLING 은 하루 최대 하락폭(novelty 계단 -3)보다 커서 역시 도달 불가능했다 — 공개 786건 전부가
 * STABLE/WATCH/NEW 로만 표시됐다.
 *
 * 새 값은 반감기 감쇠(initial-score.ts)를 적용한 시뮬레이션으로 검증했다: 하루 기준 SURGING 1,
 * FALLING 27(3.4%), RISING 3+(신규 유입 미포함 하한), 나머지 STABLE.
 */
const STATUS_THRESHOLDS = {
  /** 하루 만에 이만큼 오르면 급등. 신선한 강한 신호(velocity 0→10+)에서만 나온다. */
  surgeDelta: 8,
  /** 관측 최고점(감쇠 후 29.8)을 넘는 예외적 점수. 도달하면 변화량과 무관하게 급등. */
  surgeScore: 32,
  /** 최상위권(상위 1% 부근)에서 변화 없이 머무르면 정점. */
  peakScore: 26,
  peakStability: 2,
  rising: 3,
  falling: 2,
  /** 낮은 점수(중앙값 근처)에서 상위권 진입 수준으로 뛰면 재부상. */
  revivalLow: 15,
  revivalHigh: 20,
} as const;

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
  if (velocityDelta >= STATUS_THRESHOLDS.surgeDelta || score >= STATUS_THRESHOLDS.surgeScore) return "SURGING";
  if (score >= STATUS_THRESHOLDS.peakScore && Math.abs(score - previousScore) < STATUS_THRESHOLDS.peakStability) return "PEAK";
  if (score - previousScore >= STATUS_THRESHOLDS.rising) return "RISING";
  if (previousScore - score >= STATUS_THRESHOLDS.falling) return "FALLING";
  if (previousScore < STATUS_THRESHOLDS.revivalLow && score >= STATUS_THRESHOLDS.revivalHigh) return "REVIVAL";
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
