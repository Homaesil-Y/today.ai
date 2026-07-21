import Link from "next/link";

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
