/**
 * unstable_cache 항목이 실제로 갱신되게 만드는 캐시 키 조각.
 *
 * `unstable_cache(fn, keys, { revalidate })` 의 시간 기반 갱신이 이 배포(Next 16.2, cacheComponents
 * 미사용)에서 동작하지 않았다. 실측 2026-08-22: 공개 엔티티가 DB 762건인데 사이트는 731건만
 * 보여줬고(약 47시간 전 상태), 180초 TTL 을 훨씬 넘겨 5분간 연속 요청해도 값이 바뀌지 않았다.
 *
 * 목록이 낡으면 목록에서만 문제가 끝나지 않는다. 상세 페이지는 getPublishedTrend → 목록에서
 * slug 를 찾는 구조라, 목록에 없는 신규 서비스는 상세 페이지가 404 로 떨어진다(사용자 신고:
 * /services/squid-pay 등). 즉 "최근 등록된 서비스일수록 상세가 깨진다".
 *
 * unstable_cache 는 함수 인자를 캐시 키에 포함한다. 그래서 시간 구간 번호를 인자로 넘기면
 * 구간이 바뀔 때마다 키가 바뀌어, revalidate 동작 여부와 무관하게 새로 읽는다. 같은 구간 안에서는
 * 그대로 캐시가 공유되므로 TTFB 이득(캐시 없이 읽으면 실측 약 7초)은 유지된다.
 */
export function cacheBucket(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) throw new RangeError("seconds는 양수여야 합니다.");
  return Math.floor(Date.now() / (seconds * 1_000));
}
