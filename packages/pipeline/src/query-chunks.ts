/**
 * PostgREST 필터는 쿼리스트링으로 전송되므로 `.in()` 목록이 길어지면 요청 URL이 그만큼 커진다.
 * Node(undici)는 요청 헤드가 16KB를 넘으면 UND_ERR_HEADERS_OVERFLOW 로 fetch 자체를 실패시킨다
 * — HTTP 에러가 아니라 `TypeError: fetch failed` 로 올라오기 때문에 원인이 잘 드러나지 않는다.
 *
 * 실제로 엔티티가 402→407건으로 늘어나는 구간에서 분석 대기열 조회 URL이 16,280자가 되어
 * 파이프라인이 5회 연속 죽었다. 엔티티는 수집할 때마다 늘어나므로, 목록 전체를 한 요청에 넣는
 * 구조는 지금 통과하더라도 언젠가 반드시 이 한도를 넘는다. 그래서 개수가 아니라 길이 기준으로
 * 청크를 나눈다 — UUID(36자)와 canonical_url(100자 이상)처럼 값 길이가 크게 다른 목록을
 * 같은 규칙으로 안전하게 다루려면 길이를 합산해야 한다.
 */
export const DEFAULT_MAX_FILTER_CHARS = 4_000;

export function chunkForFilter<T>(
  values: readonly T[],
  maxChars = DEFAULT_MAX_FILTER_CHARS,
): T[][] {
  if (maxChars <= 0) throw new RangeError("maxChars는 양수여야 합니다.");

  const chunks: T[][] = [];
  let current: T[] = [];
  let currentChars = 0;

  for (const value of values) {
    // PostgREST 는 `in.("a","b")` 형태라 값마다 따옴표 2자 + 구분자 1자가 붙는다.
    const cost = String(value).length + 3;
    if (current.length > 0 && currentChars + cost > maxChars) {
      chunks.push(current);
      current = [];
      currentChars = 0;
    }
    // 값 하나가 상한보다 길어도 버리지 않고 단독 청크로 보낸다. 요청이 실패할 수는 있어도
    // 조용히 누락되는 것보다 낫다(누락은 "분석 안 됨"으로 오판되어 재분석을 유발한다).
    current.push(value);
    currentChars += cost;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

/** PostgREST 는 명시적 Range 없이는 한 응답에 최대 1000행만 돌려준다. */
export const POSTGREST_PAGE_SIZE = 1_000;

/**
 * 상한에 걸릴 수 있는 조회를 Range 로 끝까지 읽어온다.
 *
 * 이 프로젝트에서 1000행 상한은 이미 세 번 문제를 일으켰다(자동 승인, 오래된 후보 정리, 분석
 * 대기열). 특히 ai_analyses 는 엔티티마다 재분석 이력이 쌓이는 테이블이라, 청크를 잘게 나눠도
 * 시간이 지나면 청크 하나가 1000행을 넘을 수 있다. 그때 조용히 잘리면 이미 분석된 엔티티가
 * "미분석"으로 보여 같은 대상을 계속 다시 분석하게 되므로 여기서 페이지네이션을 보장한다.
 *
 * `fetchPage` 는 조회 실패 시 직접 던진다 — 호출부가 자기 에러 타입으로 감쌀 수 있게 한다.
 */
export async function readAllPages<Row>(
  fetchPage: (from: number, to: number) => Promise<Row[]>,
  pageSize = POSTGREST_PAGE_SIZE,
): Promise<Row[]> {
  if (pageSize <= 0) throw new RangeError("pageSize는 양수여야 합니다.");

  const rows: Row[] = [];
  for (let from = 0; ; from += pageSize) {
    const page = await fetchPage(from, from + pageSize - 1);
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}
