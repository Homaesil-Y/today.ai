// GTM dataLayer로 이벤트를 큐잉한다. GA4 연결·매개변수 매핑은 GTM 콘솔에서 처리하므로
// 여기서는 이벤트명+매개변수만 민다(GA를 직접 호출하지 않음).
// dataLayer.push는 GTM이 아직 로딩되기 전이어도 배열에 쌓이므로 로딩 순서를 신경 쓸 필요가 없다.

declare global {
  interface Window {
    dataLayer?: Record<string, unknown>[];
  }
}

export function trackEvent(event: string, params?: Record<string, string | number | boolean>) {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event, ...params });
}

/**
 * page_path에 남길 쿼리 파라미터.
 *
 * 차단 목록이 아니라 허용 목록인 이유: 차단 목록은 새 기능이 민감한 파라미터를 붙일 때 갱신을
 * 잊으면 그대로 새어나간다. 실제로 구독 해지 메일 링크가 `/unsubscribe?u=<사용자 id>&t=<HMAC>`
 * 형태라, 쿼리를 통째로 보내던 동안 사용자 식별자와 만료 없는 해지 토큰이 GA로 전송됐다.
 */
const TRACKED_QUERY_KEYS = ["q", "period", "category", "source", "minTrust", "sort", "page"];

/** 추적해도 되는 쿼리만 남긴 page_path를 만든다. 목록에 없는 키는 값째로 버린다. */
export function trackedPagePath(
  pathname: string,
  // useSearchParams()가 주는 ReadonlyURLSearchParams와 URLSearchParams 둘 다 받도록 좁게 요구한다.
  searchParams: { get(name: string): string | null },
): string {
  const kept = new URLSearchParams();
  for (const key of TRACKED_QUERY_KEYS) {
    const value = searchParams.get(key);
    if (value !== null) kept.set(key, value);
  }
  const search = kept.toString();
  return search ? `${pathname}?${search}` : pathname;
}

// 현재 경로를 이벤트 공통 매개변수 page_type으로 정규화한다.
// AnalyticsClickListener·AnalyticsPageView·각 클라이언트 컴포넌트가 공유해서 쓴다.
export function pageTypeFor(pathname: string): string {
  if (pathname === "/") return "home";
  if (pathname.startsWith("/admin")) return "admin";
  if (pathname.startsWith("/services/")) return "service_detail";
  if (pathname.startsWith("/reports/")) return "report_detail";
  if (pathname.startsWith("/explore")) return "explore";
  if (pathname.startsWith("/categories")) return "categories";
  if (pathname.startsWith("/compare")) return "compare";
  if (pathname.startsWith("/watchlist")) return "watchlist";
  if (pathname.startsWith("/news")) return "news";
  if (pathname.startsWith("/reports")) return "reports";
  if (pathname.startsWith("/settings")) return "settings";
  if (pathname.startsWith("/unsubscribe")) return "unsubscribe";
  if (pathname.startsWith("/login")) return "login";
  if (pathname.startsWith("/signup")) return "signup";
  if (pathname.startsWith("/onboarding")) return "onboarding";
  return "other";
}
