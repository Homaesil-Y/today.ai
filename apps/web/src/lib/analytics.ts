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
  if (pathname.startsWith("/onboarding")) return "onboarding";
  return "other";
}
