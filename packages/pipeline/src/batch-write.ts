/**
 * 후보별로 한 건씩 쓰던 upsert 를 한 요청에 묶기 위한 도우미.
 *
 * 배경: 수집 실행 하나가 후보 828건을 순차 처리하면서 후보당 DB 왕복을 2회씩 했다(엔티티 병합 →
 * alias·mention·metric). 점수 저장도 엔티티당 2회였다. 합계 약 3,200회 순차 왕복으로 "점수 계산"
 * 단계가 8~13분을 썼고, job timeout 15분에 걸려 2026-08-24 에 두 번 취소됐다.
 */

/** PostgREST 는 요청 본문 크기 제한이 넉넉하지만, 한 요청이 실패했을 때 잃는 양을 제한한다. */
export const DEFAULT_BATCH_ROWS = 500;

export function chunkRows<T>(rows: readonly T[], size = DEFAULT_BATCH_ROWS): T[][] {
  if (size <= 0) throw new RangeError("size는 양수여야 합니다.");
  const chunks: T[][] = [];
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }
  return chunks;
}

/**
 * 충돌 키가 같은 행을 하나로 합친다(나중 값 우선).
 *
 * 반드시 필요하다. Postgres 의 `ON CONFLICT DO UPDATE` 는 한 문장 안에서 같은 행을 두 번 건드리면
 * "cannot affect row a second time" 으로 문장 전체를 실패시킨다. 후보를 한 건씩 보낼 때는 각각이
 * 별도 문장이라 드러나지 않던 문제인데, 묶어 보내면 바로 터진다 — 예를 들어 같은 제품이 제목이
 * 같은 원본 여러 건으로 들어오면 (entity_id, alias) 가 겹치고, 같은 엔티티·채널·수집시각 조합도
 * 겹칠 수 있다.
 */
export function dedupeByKey<T>(rows: readonly T[], keyOf: (row: T) => string): T[] {
  const byKey = new Map<string, T>();
  for (const row of rows) byKey.set(keyOf(row), row);
  return [...byKey.values()];
}
