import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { origin, searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const requestedNext = searchParams.get("next") ?? "/";
  const next = requestedNext.startsWith("/") && !requestedNext.startsWith("//")
    ? requestedNext
    : "/";

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
      if (process.env.NODE_ENV !== "development" && forwardedHost) {
        return NextResponse.redirect(`${forwardedProto}://${forwardedHost}${destination}`);
      }
      return NextResponse.redirect(`${origin}${destination}`);
    }
  }

  return NextResponse.redirect(`${origin}/auth/error`);
}
