/**
 * 분석 대기열 우선순위.
 * - `unanalyzed`: 한 번도 분석되지 않은 후보 (대개 review 상태). 최우선 처리.
 * - `stale`: 분석 기록은 있으나 재분석 주기가 지난 후보 (대개 오래된 public).
 * - `recent`: 최근에 이미 분석된 후보. 이번 실행에서 건너뛴다.
 * - `excluded`: 관리자가 보류(private)한 후보 등 분석 대상에서 제외.
 */
export type AnalysisPriority = "unanalyzed" | "stale" | "recent" | "excluded";

export interface PendingAnalysesResult<T> {
  /** 실제 분석할 후보. 미분석 후보를 오래된 재분석 후보보다 앞세운 뒤 한도만큼 자른다. */
  pending: T[];
  /** recent/excluded 로 이번 실행에서 건너뛴 후보 수. */
  skipped: number;
  /** 한도와 무관하게 분류된 미분석 후보 총수. */
  unanalyzed: number;
  /** 한도와 무관하게 분류된 재분석 대상(stale) 후보 총수. */
  stale: number;
  /** 한도 때문에 이번 실행에서 처리하지 못하고 남은 후보 수. */
  remaining: number;
}

/**
 * 후보를 우선순위로 분류해 이번 실행에서 분석할 목록을 고른다.
 * 입력 순서(보통 점수 내림차순)는 각 우선순위 그룹 안에서 그대로 유지된다.
 */
export function selectPendingAnalyses<T>(
  candidates: T[],
  limit: number,
  classify: (candidate: T) => AnalysisPriority,
): PendingAnalysesResult<T> {
  const unanalyzed: T[] = [];
  const stale: T[] = [];
  let skipped = 0;

  for (const candidate of candidates) {
    const priority = classify(candidate);
    if (priority === "recent" || priority === "excluded") {
      skipped += 1;
      continue;
    }
    if (priority === "unanalyzed") unanalyzed.push(candidate);
    else stale.push(candidate);
  }

  const ordered = [...unanalyzed, ...stale];
  const cap = Math.max(0, limit);
  const pending = ordered.slice(0, cap);

  return {
    pending,
    skipped,
    unanalyzed: unanalyzed.length,
    stale: stale.length,
    remaining: ordered.length - pending.length,
  };
}
