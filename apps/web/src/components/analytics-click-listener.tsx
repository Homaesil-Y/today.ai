"use client";

import { useEffect } from "react";
import { pageTypeFor, trackEvent } from "@/lib/analytics";

// 전역 클릭 위임 리스너 1개. 서버 컴포넌트는 onClick 없이
// data-ga-event(이벤트명) + data-ga-params(JSON 매개변수)만 붙이면 추적된다.
// page_type은 클릭 시점의 현재 경로에서 자동으로 계산해 항상 실어보낸다.
// 관리자 화면(/admin/*)은 운영자 행동이라 지표를 오염시키므로 이벤트를 아예 쏘지 않는다.
export function AnalyticsClickListener() {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const el = target.closest<HTMLElement>("[data-ga-event]");
      if (!el) return;
      const eventName = el.dataset.gaEvent;
      if (!eventName) return;

      const pageType = pageTypeFor(window.location.pathname);
      if (pageType === "admin") return;

      let params: Record<string, string | number | boolean> = {};
      if (el.dataset.gaParams) {
        try {
          params = JSON.parse(el.dataset.gaParams);
        } catch {
          // 잘못된 JSON은 무시하고 이벤트명만 보낸다.
        }
      }
      trackEvent(eventName, { page_type: pageType, ...params });
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  return null;
}
