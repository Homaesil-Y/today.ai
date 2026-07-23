"use client";

import { RotateCcw, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

// 서버 컴포넌트/액션이 throw할 때 기본 Next 에러 화면 대신 보여줄 친화적 경계.
// reset()은 해당 세그먼트를 다시 렌더한다(재시도).
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // 운영 로깅 훅 자리. 콘솔로만 남긴다(민감정보 노출 금지).
    console.error("route error:", error.digest ?? error.message);
  }, [error]);

  return (
    <div className="page">
      <section className="empty-state" role="alert">
        <TriangleAlert size={30} />
        <h2>화면을 불러오지 못했습니다</h2>
        <p>일시적인 오류일 수 있습니다. 다시 시도하거나 잠시 후 접속해주세요.</p>
        <div className="error-actions">
          <button className="button button-primary" type="button" onClick={reset}><RotateCcw size={16} />다시 시도</button>
          <Link className="button button-secondary" href="/">오늘의 레이더로</Link>
        </div>
      </section>
    </div>
  );
}
