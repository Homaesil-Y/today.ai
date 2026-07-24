"use client";

import { ArrowUp } from "lucide-react";
import { useEffect, useState } from "react";
import { pageTypeFor, trackEvent } from "@/lib/analytics";

const SHOW_AFTER_PX = 400;

// 최상단에서는 숨겨져 있다가 스크롤을 내리면 페이드인되어 따라다니고,
// 다시 최상단으로 돌아오면 페이드아웃되는 스크롤-투-탑 버튼.
export function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let ticking = false;
    const update = () => {
      setVisible(window.scrollY > SHOW_AFTER_PX);
      ticking = false;
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <button
      type="button"
      className="back-to-top"
      data-visible={visible}
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
      aria-label="맨 위로 이동"
      onClick={() => {
        trackEvent("click_back_to_top", { page_type: pageTypeFor(window.location.pathname) });
        window.scrollTo({ top: 0, behavior: "smooth" });
      }}
    >
      <ArrowUp size={19} aria-hidden="true" />
    </button>
  );
}
