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
    return low / values.length;
  }
}
