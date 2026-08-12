/**
 * Supabase(PostgREST) 조회의 두 가지 조용한 상한을 함께 처리한다.
 *
 * (1) 응답 행 수: 명시적 Range 없이는 한 응답에 1000행까지만 온다. 넘는 부분은 에러 없이 사라진다.
 * (2) 요청 URL 길이: 필터가 쿼리스트링으로 가므로 `.in()` 목록이 길어지면 요청 헤드가 커지고,
 *     16KB를 넘으면 undici 가 UND_ERR_HEADERS_OVERFLOW 로 fetch 자체를 실패시킨다.
 *
 * 실측(2026-08-12, 공개 엔티티 577건): trend_scores 6,940행 중 1,000행만 반환돼 대부분 엔티티의
 * 점수 이력이 1~2개로 잘렸고(스파크라인·순위 변동·24H 변화가 표시되지 못함), 같은 조회에
 * id 577개를 넣은 URL은 22,633자로 로컬에서 재현 시 fetch 가 아예 실패했다.
 *
 * 파이프라인에도 같은 목적의 packages/pipeline/src/query-chunks.ts 가 있다. 한쪽 규칙을 바꾸면
 * 다른 쪽도 함께 확인해야 한다(웹은 파이프라인 패키지를 의존하지 않아 코드를 공유할 수 없다).
 */

/** `.in()` 한 번에 넣을 필터 값들의 총 길이 상한(문자). URL 여유를 크게 두고 잡는다. */
export const MAX_FILTER_CHARS = 4_000;

/** PostgREST 가 Range 없이 돌려주는 최대 행 수. */
export const PAGE_SIZE = 1_000;

/**
 * 값의 길이를 합산해 청크로 나눈다. 개수 기준이 아닌 이유: UUID(36자)와 URL(100자 이상)처럼
 * 값 길이가 다른 목록을 같은 규칙으로 안전하게 다루려면 길이를 봐야 한다.
 */
export function chunkForFilter<T>(values: readonly T[], maxChars = MAX_FILTER_CHARS): T[][] {
  if (maxChars <= 0) throw new RangeError("maxChars는 양수여야 합니다.");

  const chunks: T[][] = [];
  let current: T[] = [];
  let chars = 0;

  for (const value of values) {
    // PostgREST 는 `in.("a","b")` 형태라 값마다 따옴표 2자 + 구분자 1자가 붙는다.
    const cost = String(value).length + 3;
    if (current.length > 0 && chars + cost > maxChars) {
      chunks.push(current);
      current = [];
      chars = 0;
    }
    // 값 하나가 상한을 넘어도 버리지 않는다 — 조용히 빠지면 데이터 누락으로 오인된다.
    current.push(value);
    chars += cost;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

/** Range 로 끝까지 읽어 1000행 상한에서 조용히 잘리는 것을 막는다. */
export async function readAllPages<Row>(
  fetchPage: (from: number, to: number) => Promise<Row[]>,
  pageSize = PAGE_SIZE,
): Promise<Row[]> {
  if (pageSize <= 0) throw new RangeError("pageSize는 양수여야 합니다.");

  const rows: Row[] = [];
  for (let from = 0; ; from += pageSize) {
    const page = await fetchPage(from, from + pageSize - 1);
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

/** id 목록을 청크로 나눠 각 청크를 끝까지 읽고 하나로 합친다. */
export async function readAllByIds<Row, Id>(
  ids: readonly Id[],
  fetchPage: (chunk: Id[], from: number, to: number) => Promise<Row[]>,
): Promise<Row[]> {
  const rows: Row[] = [];
  for (const chunk of chunkForFilter(ids)) {
    rows.push(...await readAllPages((from, to) => fetchPage(chunk, from, to)));
  }
  return rows;
}
