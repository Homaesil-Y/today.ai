/**
 * 제출된 관심 카테고리를 실제 활성 카테고리와의 교집합으로 정제한다.
 *
 * 예전엔 개수 상한(`z.array(...).max(20)`)으로만 검증했다. 카테고리는 관리자 승인으로 계속
 * 늘어나는데(작성 시점 20개 이하 → 2026-08-13 기준 23개) 상한은 고정이라, "전체 선택"을 누르면
 * 23개가 제출돼 ZodError 가 던져졌다. 서버 액션에서 잡히지 않아 저장이 실패하고 에러 화면이 떴다.
 *
 * 개수를 세는 대신 존재하는 slug 인지 확인한다. 카테고리가 몇 개로 늘어도 깨지지 않고, 개수
 * 상한이 못 걸러내던 위조·삭제된 slug 를 실제로 걸러낸다.
 *
 * @param enabledSlugs 활성 카테고리 slug 목록. 조회에 실패해 알 수 없으면 null 을 넘긴다 —
 *   그 경우 사용자의 선택을 임의로 버리지 않는다(저장이 조용히 비어버리는 것보다 낫다).
 */
export function sanitizeCategories(submitted: string[], enabledSlugs: string[] | null): string[] {
  const unique = [...new Set(submitted)];
  if (unique.length === 0) return [];
  if (enabledSlugs === null) return unique;

  const allowed = new Set(enabledSlugs);
  return unique.filter((slug) => allowed.has(slug));
}
