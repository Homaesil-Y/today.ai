import type { SourceCode } from "@ai-trend-radar/types";

/**
 * 채널마다 "반응 지표"의 척도가 완전히 달라, 원시 수치를 그대로 비교하면 순위가 한 채널로 쏠린다.
 *
 * 실측(2026-08-07, 수집분 기준):
 *   Hacker News points  중앙값   2 / 75% 4   / 90% 10  / 최대 824
 *   Product Hunt votes  중앙값 194 / 75% 352 / 90% 469 / 최대 892
 *
 * 100배 가까이 차이난다. 원시값을 같은 로그 공식에 넣으면 HN 상위 10%(10점)가 velocity 5.2인데
 * PH 중앙값(194표)이 11.5를 받는다 — 평범한 PH 런칭이 뛰어난 HN 게시물을 2배 이상 앞선다.
 * 그 결과 공개 엔티티는 HN 60% / PH 36%인데 상위 50위는 48건이 PH 단독이었다.
 *
 * 이는 PH가 실제로 더 뜨거워서가 아니라 런칭하면 기본 수백 표를 받는 플랫폼이라 바닥값이 높기
 * 때문이다. 그래서 절대 수치가 아니라 "같은 채널 안에서 얼마나 상위인가"로 환산한다.
 * 이러면 채널별 분포가 달라져도 재보정이 필요 없고, 새 채널을 붙여도 규칙이 그대로 성립한다.
 */
/** 이 개수 이상이면 채널 1위가 백분위 1.0(상한)에 닿게 한다. 그 미만은 보수적으로 n 으로 나눈다. */
export const MIN_SAMPLES_FOR_FULL_RANGE = 10;

export class EngagementPercentiles {
  /** 채널별 지표값 오름차순 목록. */
  private readonly sorted = new Map<SourceCode, number[]>();

  constructor(samples: Array<{ source: SourceCode; value: number }>) {
    const grouped = new Map<SourceCode, number[]>();
    for (const { source, value } of samples) {
      // 반응이 전혀 없는 항목(0)은 분포에서 제외한다. 포함하면 0이 많은 채널의 백분위가
      // 통째로 밀려 올라가 실제보다 후하게 평가된다.
      if (!Number.isFinite(value) || value <= 0) continue;
      const list = grouped.get(source);
      if (list) list.push(value);
      else grouped.set(source, [value]);
    }
    for (const [source, values] of grouped) {
      values.sort((a, b) => a - b);
      this.sorted.set(source, values);
    }
  }

  /**
   * 해당 채널 안에서 value 보다 작은 표본의 비율(0~1). 표본이 없으면 판단할 근거가 없으므로 0.
   * 값이 0 이하면(반응 없음) 0을 돌려 velocity 를 주지 않는다.
   *
   * 분모는 표본이 충분하면 n-1 이다. n 으로 나누면 최댓값이 (n-1)/n 이라 채널의 1위조차 상한에
   * 닿지 못하고, 표본이 적은 채널일수록 손해가 커진다(표본 5개면 1위가 0.8 → 제곱 후 상한의 64%).
   * 표본이 적을 때(MIN_SAMPLES_FOR_FULL_RANGE 미만)는 반대로 보수적으로 n 을 쓴다 — 항목 몇 개짜리
   * 채널의 1위가 다른 채널 최상위와 같은 velocity 를 받으면 안 되기 때문이다.
   */
  rank(source: SourceCode, value: number): number {
    if (!Number.isFinite(value) || value <= 0) return 0;
    const values = this.sorted.get(source);
    if (!values || values.length === 0) return 0;

    // 이 값보다 작은 표본 수를 이분 탐색으로 센다.
    let low = 0;
    let high = values.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if ((values[mid] as number) < value) low = mid + 1;
      else high = mid;
    }
    const denominator = values.length >= MIN_SAMPLES_FOR_FULL_RANGE ? values.length - 1 : values.length;
    return Math.min(1, low / denominator);
  }
}

/**
 * 점수 계산에 필요한 채널별 분포 묶음.
 *
 * 축이 늘어날 때마다 calculateInitialTrendScore 의 인자를 하나씩 붙이면 호출부가 위치 인자
 * 순서에 묶인다. 분포는 "이번 실행의 후보 전체"에서 한 번에 만들어지는 값이라 함께 다닌다.
 */
export class ScoreDistributions {
  readonly engagement: EngagementPercentiles;
  readonly comments: EngagementPercentiles;

  constructor(samples: Array<{ source: SourceCode; engagement: number; comments: number }>) {
    this.engagement = new EngagementPercentiles(samples.map(({ source, engagement }) => ({ source, value: engagement })));
    this.comments = new EngagementPercentiles(samples.map(({ source, comments }) => ({ source, value: comments })));
  }
}
