"use client";

import { useEffect } from "react";
import { trackEvent } from "@/lib/analytics";

// 검색/필터 결과가 0건일 때 마운트되어 view_no_results를 1회 발화한다.
// 서버 컴포넌트인 목록 페이지가 빈 상태를 렌더할 때만 함께 렌더하면 된다.
export function AnalyticsNoResults({ searchTerm, pageType }: { searchTerm: string; pageType: string }) {
  useEffect(() => {
    trackEvent("view_no_results", { search_term: searchTerm, page_type: pageType });
  }, [searchTerm, pageType]);
  return null;
}
