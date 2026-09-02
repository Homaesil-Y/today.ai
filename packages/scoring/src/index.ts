import type { TrendScoreBreakdown, TrendStatus } from "@ai-trend-radar/types";

/**
 * 점수 척도가 바뀌면 반드시 올린다.
 *
 * loadScoreHistory 가 이 버전으로 이력을 걸러내므로(repository.ts), 버전을 올리지 않고 가중치를
 * 바꾸면 새 척도 점수를 옛 척도 점수와 비교해 전 엔티티가 한꺼번에 RISING/FALLING 으로 뒤집힌다.
 *
 * v2: 죽은 축(threads·reddit·instagram) 가중치를 0으로 내리고 comments 축을 추가, 재배분.
 * v3: 모멘텀과 신선도를 분리. 상태는 반응 신호(engagementSignal)의 변화로만 판정하고 총점은
 *     순위에만 쓴다. productGrowth 를 velocity 로 흡수(GitHub 스타를 채널 내 백분위로), quality 를
 *     동점 정리용으로 축소, crossSource 도 감쇠.
 */
export const SCORING_VERSION = "v3";

/**
 * 축별 상한. 합은 100이다.
 *
 * 축은 두 부류다.
 *   반응 신호(모멘텀): velocity · comments · crossSource — "지금 얼마나 반응이 있는가". 감쇠한다.
 *   맥락: novelty(발견 후 경과) · quality(설명 완결성) — 순위에는 들어가지만 상태 판정에는 쓰지 않는다.
 *
 * threads·reddit·instagram 이 0인 이유: 세 채널 모두 수집 경로가 막혀 있다(Reddit 은 API 승인 거절,
 * Threads·Instagram 은 Meta App Review 미통과). 축과 컬럼은 남겨둔다 — 열리면 상한만 올리고
 * pipeline 의 simulate-decay.ts 로 재보정하면 된다.
 *
 * productGrowth 가 0인 이유: 엔티티의 2%(GitHub 단독)만 값을 가졌고, 그 2%는 반대로 velocity·comments
 * 를 아예 받지 못해 상한이 ~35점에 묶였다(상위 50위 커트라인 ~30). 스타를 GitHub 채널 내 백분위로
 * velocity 에 넣으면 다른 채널과 같은 규칙으로 경쟁하므로 별도 축이 필요 없다.
 *
 * quality 가 5인 이유: v2 에서 8점이었을 때 분포가 8점 653건 / 1.6점 285건으로 사실상 이진이었고,
 * 설명 유무가 만드는 6.4점 차이가 중위권 velocity 평균(2~3점)보다 커서 "설명이 있는가"가 "반응이
 * 있는가"보다 순위를 더 크게 결정했다. 데이터 완결성은 트렌드 신호가 아니다. 동점 정리 수준(단계 간
 * 1점)으로 낮춘다.
 */
const limits: TrendScoreBreakdown = {
  crossSource: 20,
  velocity: 40,
  comments: 20,
  productGrowth: 0,
  threads: 0,
  reddit: 0,
  novelty: 15,
  instagram: 0,
  quality: 5,
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
 * 반응 신호의 합. 상태 판정과 순위 노출 하한이 보는 값이다.
 *
 * 총점 대신 이 값을 쓰는 이유: v2 까지는 상태를 총점의 하루 차이로 판정했는데, 총점에는 달력에 따라
 * 계단식으로 내려가는 novelty 가 들어 있어 모든 엔티티가 발견 7일째·30일째에 자동으로 FALLING 이
 * 됐다(7일 실측: FALLING 274건 중 187건, 68%가 반응 변화 없이 달력 때문). 반대로 SURGING 은 절대
 * 점수(≥45)로도 붙어서 65건 중 48건(74%)이 제자리거나 하락 중인데 "24시간 급상승"으로 표시됐다.
 * 반응 축만 보면 두 왜곡이 구조적으로 사라진다.
 */
export function engagementSignal(input: TrendScoreBreakdown): number {
  return Math.round((clamp(input.velocity, limits.velocity)
    + clamp(input.comments, limits.comments)
    + clamp(input.productGrowth, limits.productGrowth)
    + clamp(input.crossSource, limits.crossSource)) * 10) / 10;
}

/**
 * 상태 판정 임계값. 반응 신호(engagementSignal, 0~80)의 하루 변화량 기준이다.
 *
 * 2026-08-26~09-01 저장된 스냅샷 5,246건의 전이를 v3 척도로 환산해 유도했다:
 *   신호 Δ 분포: 중앙 -0.13 · 95% 0.00 · 99% +1.33 · 최대 +46.4
 *   Δ ≥ +3: 6.3건/일 · Δ ≥ +10: 2.8건/일 · Δ ≤ -3: 11건/일 · Δ ≤ -4: 3.8건/일
 *   감쇠만으로 나는 하루 하락: S=30 → -2.8, S=40 → -3.8 (재수집이 끊긴 상위권만 -3 을 넘는다)
 *   신호합 분포: 최고 54 · 상위1% 40 · 상위5% 21.5 · 중앙 0.9
 *
 * 상승은 재수집으로 지표가 실제로 늘었을 때만 나오므로(감쇠는 내리기만 한다) 하락보다 드물다.
 * 이것은 데이터의 성질이며, 임계값을 낮춰 상승을 "만들어내지" 않는다.
 */
const STATUS_THRESHOLDS = {
  /** 하루에 반응 신호가 이만큼 뛰면 급등. 재수집으로 순위권에 새로 진입하는 수준. */
  surge: 10,
  /** 이만큼 오르면 상승. 한 채널에서 반응이 눈에 띄게 늘어난 수준. */
  rising: 3,
  /** 이만큼 내리면 하락. 감쇠만으로는 상위권(S≥32)만 도달하므로 "큰 것이 식는다"는 뜻이 된다. */
  falling: 3,
  /** 상위 1%(40) 이상에서 변화 없이 머무르면 정점. 재수집이 계속되는 최상위만 해당한다. */
  peakSignal: 40,
  peakStability: 1.5,
  /** 일주일 넘게 조용했던(신호 <3) 엔티티가 다시 +3 이상 뛰면 재부상. */
  revivalQuietBelow: 3,
  revivalMinAgeHours: 7 * 24,
} as const;

export function calculateStatus(params: {
  firstDetectedHours: number;
  /** 이번 스냅샷의 반응 신호(engagementSignal). */
  signal: number;
  /** 직전(같은 척도) 스냅샷의 반응 신호. 이력이 없으면 signal 과 같은 값을 넘긴다. */
  previousSignal: number;
  dataPoints: number;
}): TrendStatus {
  const { firstDetectedHours, signal, previousSignal, dataPoints } = params;
  // NEW 를 먼저 본다. 이력이 없어도 "언제 처음 발견됐는지"만으로 답할 수 있는 상태다.
  // dataPoints 검사가 앞에 있던 동안은 갓 발견된 서비스가 첫날 반드시 WATCH 로 표시됐다.
  if (firstDetectedHours <= 24) return "NEW";
  // 움직임으로 판정하는 아래 규칙들은 직전 스냅샷이 있어야 한다.
  if (dataPoints < 2) return "WATCH";
  const delta = signal - previousSignal;
  if (
    firstDetectedHours > STATUS_THRESHOLDS.revivalMinAgeHours
    && previousSignal < STATUS_THRESHOLDS.revivalQuietBelow
    && delta >= STATUS_THRESHOLDS.rising
  ) return "REVIVAL";
  if (delta >= STATUS_THRESHOLDS.surge) return "SURGING";
  if (signal >= STATUS_THRESHOLDS.peakSignal && Math.abs(delta) < STATUS_THRESHOLDS.peakStability) return "PEAK";
  if (delta >= STATUS_THRESHOLDS.rising) return "RISING";
  if (delta <= -STATUS_THRESHOLDS.falling) return "FALLING";
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
