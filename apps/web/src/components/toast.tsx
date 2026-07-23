"use client";

import { CheckCircle2, X } from "lucide-react";
import { useEffect, useState } from "react";

// 액션 성공 후 상단에 잠시 떠오르는 확인 토스트. 4초 뒤 자동으로 사라지고, 닫기 버튼도 제공한다.
// 새로고침 시 다시 뜨지 않도록, 표시되면 URL의 표시용 쿼리 파라미터를 제거한다.
export function Toast({ message, clearParam }: { message: string; clearParam?: string }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (clearParam && typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (url.searchParams.has(clearParam)) {
        url.searchParams.delete(clearParam);
        window.history.replaceState(null, "", url.pathname + url.search);
      }
    }
    const timer = setTimeout(() => setVisible(false), 4000);
    return () => clearTimeout(timer);
  }, [clearParam]);

  if (!visible) return null;
  return (
    <div className="toast" role="status">
      <CheckCircle2 size={17} aria-hidden="true" />
      <span>{message}</span>
      <button type="button" className="toast-close" aria-label="알림 닫기" onClick={() => setVisible(false)}><X size={15} /></button>
    </div>
  );
}
