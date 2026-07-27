"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef } from "react";
import { pageTypeFor, trackEvent } from "@/lib/analytics";

// URL에서 표시용 마커 파라미터를 제거한다(새로고침 시 이벤트 재발화 방지).
// 기존 Toast 컴포넌트의 clearParam 패턴과 동일한 방식.
function stripParam(name: string) {
  const url = new URL(window.location.href);
  url.searchParams.delete(name);
  window.history.replaceState(null, "", url.pathname + url.search);
}

const SEARCH_FILTER_KEYS = ["period", "category", "source", "minTrust", "sort"];

function AnalyticsPageViewInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // 직전에 이미 처리한 경로+쿼리 조합을 기억해 React StrictMode의 이펙트 2회 실행에도
  // 같은 페이지뷰를 중복 발화하지 않는다(뒤로가기로 같은 URL에 다시 오면 정상적으로 재발화된다).
  const lastKey = useRef<string | null>(null);

  useEffect(() => {
    const search = searchParams.toString();
    const key = `${pathname}?${search}`;
    if (lastKey.current === key) return;
    lastKey.current = key;

    const pageType = pageTypeFor(pathname);
    // 관리자 화면은 운영자 행동이라 지표에서 제외한다.
    if (pageType === "admin") return;

    trackEvent("page_view", {
      page_path: search ? `${pathname}?${search}` : pathname,
      page_title: typeof document !== "undefined" ? document.title : "",
      page_type: pageType,
    });

    // 로그인 완료 퍼널: auth 콜백/온보딩 완료/회원 탈퇴가 리다이렉트에 붙인 1회성 마커를 감지·소모한다.
    if (searchParams.get("login") === "1") {
      trackEvent("login", { method: "google", page_type: pageType });
      stripParam("login");
    }
    if (searchParams.get("onboarded") === "1") {
      const categoriesCount = searchParams.get("categories_count");
      trackEvent("complete_onboarding", {
        page_type: pageType,
        ...(categoriesCount !== null ? { categories_count: Number(categoriesCount) } : {}),
      });
      stripParam("onboarded");
      stripParam("categories_count");
    }
    if (pathname === "/" && searchParams.get("goodbye") === "1") {
      trackEvent("delete_account", { page_type: pageType });
      stripParam("goodbye");
    }
    if (pageType === "unsubscribe" && searchParams.get("done") === "1") {
      trackEvent("save_preferences", { page_type: pageType, daily_digest: false, method: "email_link" });
      stripParam("done");
    }
    if (pageType === "settings" && searchParams.get("saved") === "1") {
      const dailyDigest = searchParams.get("daily_digest");
      const surgeAlert = searchParams.get("surge_alert");
      trackEvent("save_preferences", {
        page_type: pageType,
        ...(dailyDigest !== null ? { daily_digest: dailyDigest === "1" } : {}),
        ...(surgeAlert !== null ? { surge_alert: surgeAlert === "1" } : {}),
      });
      // Toast 컴포넌트도 saved는 지우므로 중복 삭제는 안전(멱등)하다. daily_digest/surge_alert는 여기서만 지운다.
      stripParam("daily_digest");
      stripParam("surge_alert");
    }

    // 검색 이벤트: 헤더 검색과 탐색 페이지 자체 검색 폼이 둘 다 /explore로 제출되므로
    // URL만으로 구분해야 한다 — 탐색 폼에만 있는 필터 파라미터 존재 여부로 판별한다.
    const q = searchParams.get("q");
    if (q) {
      if (pageType === "explore") {
        const hasFilterParams = SEARCH_FILTER_KEYS.some((filterKey) => searchParams.has(filterKey));
        const period = searchParams.get("period");
        const category = searchParams.get("category");
        const source = searchParams.get("source");
        const minTrust = searchParams.get("minTrust");
        const sort = searchParams.get("sort");
        trackEvent("search", {
          search_term: q,
          search_source: hasFilterParams ? "explore" : "header",
          page_type: pageType,
          ...(period ? { filter_period: period } : {}),
          ...(category ? { filter_category: category } : {}),
          ...(source ? { filter_source: source } : {}),
          ...(minTrust ? { filter_trust: minTrust } : {}),
          ...(sort ? { sort } : {}),
        });
      } else if (pageType === "news") {
        trackEvent("search", { search_term: q, search_source: "news", page_type: pageType });
      }
    }
  }, [pathname, searchParams]);

  return null;
}

// useSearchParams는 Suspense 경계가 필요하다(정적 렌더 opt-out 요구사항).
export function AnalyticsPageView() {
  return (
    <Suspense fallback={null}>
      <AnalyticsPageViewInner />
    </Suspense>
  );
}
