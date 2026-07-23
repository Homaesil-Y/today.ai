import { NextResponse } from "next/server";
import { safeNextPath } from "@/lib/navigation";
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
      const destination = profile?.onboarding_completed
        ? next
        : `/onboarding?next=${encodeURIComponent(next)}`;
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
