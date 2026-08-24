import type { Metadata } from "next";
import Link from "next/link";

// 로그인 실패 안내 화면. 익명 사용자에게도 그대로 렌더되므로 크롤러가 도달할 수 있는데,
// 검색 결과에 남을 내용이 아니다(형제 인증 페이지 /login·/signup 과 같은 선언).
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function AuthErrorPage() {
  return (
    <div className="page">
      <div className="empty-state">
        <h1>로그인을 완료하지 못했습니다</h1>
        <p>Google 또는 Supabase 설정을 확인한 뒤 다시 시도해주세요.</p>
        <Link className="button button-primary" href="/login">로그인 다시 시도</Link>
      </div>
    </div>
  );
}
