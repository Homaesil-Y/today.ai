import { ShieldCheck, Sparkles } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { GoogleLoginButton } from "@/components/google-login-button";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export default async function LoginPage() {
  const configured = isSupabaseConfigured();
  if (configured) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) redirect("/");
  }

  return (
    <div className="login-page">
      <section className="login-card">
        <span className="brand-mark login-brand"><Sparkles size={24} /></span>
        <p className="login-service-name"><strong>오늘의 AI</strong></p>
        <h1>오늘 뜨는 AI 서비스를<br />가장 먼저 확인하세요.</h1>
        <p className="login-copy">로그인하면 관심 목록, 개인 메모와 맞춤 알림을 사용할 수 있습니다.</p>
        <GoogleLoginButton configured={configured} />
        <div className="login-assurance"><ShieldCheck size={16} /><span>Google의 기본 프로필과 이메일만 요청합니다.</span></div>
        <Link className="browse-link" href="/">로그인 없이 둘러보기</Link>
        <div className="login-legal"><Link href="/terms">이용약관</Link><Link href="/privacy">개인정보처리방침</Link></div>
      </section>
    </div>
  );
}
