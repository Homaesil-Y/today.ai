import type { TrendScoreBreakdown, TrendStatus } from "@ai-trend-radar/types";

/**
 * 점수 척도가 바뀌면 반드시 올린다.
 *
 * loadScoreHistory 가 이 버전으로 이력을 걸러내므로(repository.ts), 버전을 올리지 않고 가중치를
 * 바꾸면 새 척도 점수를 옛 척도 점수와 비교해 전 엔티티가 한꺼번에 RISING/FALLING 으로 뒤집힌다.
 *
 * v2: 죽은 축(threads·reddit·instagram) 가중치를 0으로 내리고 comments 축을 추가, 살아 있는
 *     축 합이 100이 되도록 재배분.
 */
export const SCORING_VERSION = "v2";

/**
 * 축별 상한. 합은 100이다.
 *
 * threads·reddit·instagram 이 0인 이유: 세 채널 모두 수집 경로가 막혀 있다. Reddit 은 API 승인이
 * 거절됐고 Threads·Instagram 은 Meta App Review 를 통과하지 못했다. 실측으로 세 축은 공개 793건
 * 전부에서 0이었다 — 명목 27점이 아무에게도 갈 수 없는 상태로 남아, 도달 가능한 최고점을 34.6 으로
 * 묶고 상태 임계값(SURGING ≥85 등)을 영구히 도달 불가로 만들었다. 축과 컬럼은 남겨둔다: 채널이
 * 열리면 상한만 올리고 pipeline 의 simulate-decay.ts 로 재보정하면 된다.
 *
 * 살아 있는 축의 배분은 실측 시뮬레이션으로 골랐다(대형 동점 그룹 30% → 13%, 상위 50위 중 46건
 * 유지). velocity 를 최대 가중치로 둔 이유는 유일하게 대부분의 엔티티에서 값이 나오는 축이기
 * 때문이다(77% 비영, 나머지는 crossSource 1% · productGrowth 2%).
 */
const limits: TrendScoreBreakdown = {
  crossSource: 20,
  velocity: 30,
  comments: 15,
  productGrowth: 15,
  threads: 0,
  reddit: 0,
  novelty: 12,
  instagram: 0,
  quality: 8,
};

/** 축 상한의 합. 점수가 이 범위를 넘지 않음을 호출부·테스트가 확인할 수 있게 노출한다. */
export const MAX_TREND_SCORE = (Object.values(limits) as number[]).reduce((sum, value) => sum + value, 0);

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
 * 전제했는데, 죽은 축 27점이 아무에게도 갈 수 없어 실제 점수는 최고 34.6·중앙값 11 에 머물렀다.
 * SURGING·PEAK·REVIVAL 은 도달 가능한 점수가 존재하지 않았고, FALLING 은 하루 최대 하락폭보다
 * 커서 역시 도달 불가능했다 — 공개 786건 전부가 STABLE/WATCH/NEW 로만 표시됐다.
 *
 * v2 척도(죽은 축 0 + comments 축 + 재배분) 실측 분포, 793건:
 *   최고 59.4 | 상위1% 42.7 | 상위5% 31.5 | 상위10% 25.4 | 중앙 12.6
 *   ≥50: 5건 · ≥40: 13건 · ≥35: 27건 · ≥30: 49건
 *
 * 이 분포에 맞춰 각 상태가 "드물지만 도달 가능"하도록 잡았다. 점수 기준(surgeScore·peakScore)은
 * 움직임이 아니라 절대 수준을 보는 규칙이라 상위 1% 부근에 둔다 — 더 낮추면 상위권이 변화 없이
 * 영구히 SURGING 으로 붙어 있어 배지가 의미를 잃는다.
 */
const STATUS_THRESHOLDS = {
  /** 하루 만에 이만큼 오르면 급등. 재수집으로 반응이 실제로 뛴 경우에만 나온다. */
  surgeDelta: 10,
  /** 상위 1%(42.7)를 넘는 예외적 점수. 도달하면 변화량과 무관하게 급등으로 본다. */
  surgeScore: 45,
  /** 상위 2% 부근에서 변화 없이 머무르면 정점. */
  peakScore: 38,
  peakStability: 2,
  rising: 4,
  falling: 3,
  /** 중앙값 근처에서 상위 10% 수준으로 뛰면 재부상. */
  revivalLow: 13,
  revivalHigh: 25,
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
