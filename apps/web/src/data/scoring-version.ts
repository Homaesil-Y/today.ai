/**
 * 엔티티별로 최신 스냅샷과 같은 척도(scoring_version)의 행만 남긴다.
 *
 * 점수 공식이 바뀌면 scoring_version 이 올라가고, 같은 엔티티에 옛 척도와 새 척도 행이 함께
 * 남는다. 걸러내지 않으면 "직전 점수"로 옛 척도 값이 잡혀 24H 변화·스파크라인·순위 변동이 전부
 * 척도 차이를 변화로 착각한다 — 실측 예(2026-08-26): v2 11.4 를 v1 6.9 와 비교해 +4.5 상승으로
 * 표시했지만, 같은 척도끼리 비교하면 14.6 → 11.4 로 -3.2 하락이었다.
 *
 * 버전을 상수로 박지 않고 "각 엔티티의 최신 행이 쓰는 버전"을 기준으로 삼는다. 배포와 파이프라인
 * 실행 사이에 순서가 어긋나도, 엔티티마다 전환 시점이 달라도 스스로 맞는다.
 *
 * 입력은 엔티티별로 최신이 앞에 오도록 정렬돼 있어야 한다(calculated_at 내림차순).
 */
export function keepLatestScoringVersion<T extends { entity_id: string; scoring_version: string }>(rows: T[]): T[] {
  const versionByEntity = new Map<string, string>();
  for (const row of rows) if (!versionByEntity.has(row.entity_id)) versionByEntity.set(row.entity_id, row.scoring_version);
  return rows.filter((row) => versionByEntity.get(row.entity_id) === row.scoring_version);
}
