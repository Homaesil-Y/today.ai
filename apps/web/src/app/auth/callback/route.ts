import { NextResponse } from "next/server";
import { safeNextPath, withParam } from "@/lib/navigation";
import { siteConfig } from "@/lib/site";
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
      const { data: profile } = data.user
        ? await supabase.from("user_profiles").select("onboarding_completed").eq("id", data.user.id).maybeSingle()
        : { data: null };
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
