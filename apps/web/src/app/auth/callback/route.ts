import { NextResponse } from "next/server";
import { verifyConsentToken } from "@/lib/consent-token";
import { safeNextPath, withParam } from "@/lib/navigation";
import { POLICY_VERSION } from "@/lib/policy";
import { siteConfig } from "@/lib/site";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// x-forwarded-host는 공격자가 조작할 수 있으므로, 구성된 앱 호스트/요청 origin과 일치할 때만 신뢰한다.
function isAllowedHost(host: string, origin: string) {
  try {
    return host === new URL(siteConfig.url).host || host === new URL(origin).host;
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  const { origin, searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const { data: profile, error: profileError } = data.user
        ? await supabase.from("user_profiles").select("onboarding_completed, terms_agreed_at").eq("id", data.user.id).maybeSingle()
        : { data: null, error: null };

      // 프로필을 읽지 못하면 신규인지 기존 회원인지 판단할 수 없다. 이 상태에서 아래 삭제 분기로 흘러가면
      // 기존 회원 계정이 지워지므로, 아무것도 건드리지 않고 로그인만 실패시킨다(안전한 실패).
      if (data.user && profileError) {
        return NextResponse.redirect(`${origin}/auth/error`);
      }

      // 신규 가입 판별. auth 유저 생성 시 트리거가 user_profiles를 자동 생성하므로 "행이 없음"으로는
      // 신규를 구분할 수 없다. 동의 기록(terms_agreed_at)이 있는지로 "가입이 완료된 회원"을 판단한다.
      if (data.user && !profile?.terms_agreed_at) {
        const admin = createAdminClient();
        // 동의를 거치지 않고 도달한 신규 계정(예: /login으로 들어온 미가입자)은 가입을 성립시키지 않는다.
        // 인증 왕복은 이미 일어났으므로 여기서 계정을 삭제해야 "동의 없는 가입"이 남지 않는다.
        if (!verifyConsentToken(searchParams.get("sc"))) {
          await admin.auth.admin.deleteUser(data.user.id);
          await supabase.auth.signOut();
          return NextResponse.redirect(`${origin}/signup?consent=required&next=${encodeURIComponent(next)}`);
        }
        const agreedAt = new Date().toISOString();
        const { error: consentError } = await admin
          .from("user_profiles")
          .update({ terms_agreed_at: agreedAt, privacy_agreed_at: agreedAt, agreed_policy_version: POLICY_VERSION })
          .eq("id", data.user.id);
        // 동의 증빙을 남기지 못하면 가입을 완료된 것으로 취급하지 않는다(다음 로그인에 다시 걸린다).
        if (consentError) {
          await admin.auth.admin.deleteUser(data.user.id);
          await supabase.auth.signOut();
          return NextResponse.redirect(`${origin}/signup?consent=required&next=${encodeURIComponent(next)}`);
        }
      }

      // login=1은 AnalyticsPageView가 도착 페이지에서 감지해 login 이벤트를 쏘고 스스로 지운다.
      const destination = withParam(
        profile?.onboarding_completed ? next : `/onboarding?next=${encodeURIComponent(next)}`,
        "login",
        "1",
      );
      const forwardedHost = request.headers.get("x-forwarded-host");
      const forwardedProto = request.headers.get("x-forwarded-proto") ?? "https";
      if (process.env.NODE_ENV !== "development" && forwardedHost && isAllowedHost(forwardedHost, origin)) {
        return NextResponse.redirect(`${forwardedProto}://${forwardedHost}${destination}`);
      }
      return NextResponse.redirect(`${origin}${destination}`);
    }
  }

  return NextResponse.redirect(`${origin}/auth/error`);
}
