"use client";

import { useState } from "react";
import { trackEvent } from "@/lib/analytics";
import { createClient } from "@/lib/supabase/client";

export function GoogleLoginButton({ configured, nextPath = "/" }: { configured: boolean; nextPath?: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    if (!configured) return;
    setLoading(true);
    setError(null);
    trackEvent("login_start", { method: "google", trigger: "login_page" });
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
        scopes: "openid email profile",
      },
    });

    if (signInError) {
      setError("Google 로그인을 시작하지 못했습니다. 잠시 후 다시 시도해주세요.");
      setLoading(false);
    }
  }

  return (
    <div className="login-action">
      <button
        className="google-button"
        type="button"
        onClick={signIn}
        disabled={!configured || loading}
      >
        <span className="google-mark" aria-hidden="true">G</span>
        {loading ? "Google로 이동 중…" : "Google로 계속하기"}
      </button>
      {!configured && (
        <p role="status">Supabase Publishable Key를 설정하면 로그인을 사용할 수 있습니다.</p>
      )}
      {error && <p className="login-error" role="alert">{error}</p>}
    </div>
  );
}
