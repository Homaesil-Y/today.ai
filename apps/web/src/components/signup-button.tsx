"use client";

import { useState } from "react";
import { issueConsentToken } from "@/app/signup/actions";
import { LegalDialog } from "@/components/legal-dialog";
import { PrivacyContent, TermsContent } from "@/components/legal-content";
import { trackEvent } from "@/lib/analytics";
import { createClient } from "@/lib/supabase/client";

// 가입 전용 버튼. 동의를 체크하지 않으면 구글로 넘어가는 것 자체를 막는다(가입이 시작되지 않는다).
export function SignupButton({ configured, nextPath = "/", consentRequired = false }: { configured: boolean; nextPath?: string; consentRequired?: boolean }) {
  const [loading, setLoading] = useState(false);
  const [consented, setConsented] = useState(false);
  const [error, setError] = useState<string | null>(
    consentRequired ? "약관에 동의해야 가입이 완료됩니다. 동의 후 다시 시도해주세요." : null,
  );

  async function signUp() {
    if (!configured) return;
    if (!consented) {
      setError("이용약관 및 개인정보처리방침에 동의해야 가입할 수 있습니다.");
      return;
    }
    setLoading(true);
    setError(null);
    trackEvent("login_start", { method: "google", trigger: "signup_page" });

    // 동의 증빙 토큰을 먼저 받아 redirectTo에 실어 보낸다. 콜백이 이 토큰으로 "동의를 거친 가입"임을 확인한다.
    const consentToken = await issueConsentToken();
    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}&sc=${encodeURIComponent(consentToken)}`;
    const { error: signUpError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo, scopes: "openid email profile" },
    });

    if (signUpError) {
      setError("Google 가입을 시작하지 못했습니다. 잠시 후 다시 시도해주세요.");
      setLoading(false);
    }
  }

  return (
    <div className="login-action">
      <label className="login-consent">
        <input type="checkbox" checked={consented} onChange={(event) => { setConsented(event.target.checked); if (event.target.checked) setError(null); }} />
        <span>
          [필수] <LegalDialog label="이용약관" title="이용약관"><TermsContent /></LegalDialog> 및{" "}
          <LegalDialog label="개인정보처리방침" title="개인정보처리방침"><PrivacyContent /></LegalDialog>에 동의합니다.
        </span>
      </label>
      <button className="google-button" type="button" onClick={signUp} disabled={!configured || loading}>
        <span className="google-mark" aria-hidden="true">G</span>
        {loading ? "Google로 이동 중…" : "Google로 가입하기"}
      </button>
      {!configured && <p role="status">Supabase Publishable Key를 설정하면 가입을 사용할 수 있습니다.</p>}
      {error && <p className="login-error" role="alert">{error}</p>}
    </div>
  );
}
