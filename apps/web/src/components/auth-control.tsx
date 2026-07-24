import { CircleUserRound } from "lucide-react";
import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "./sign-out-button";

export async function AuthControl() {
  if (!isSupabaseConfigured()) {
    return <Link className="profile-button" href="/login" data-ga-event="login_start" data-ga-params={JSON.stringify({ method: "google", trigger: "header" })}><CircleUserRound size={22} /><span>로그인</span></Link>;
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return <Link className="profile-button" href="/login" data-ga-event="login_start" data-ga-params={JSON.stringify({ method: "google", trigger: "header" })}><CircleUserRound size={22} /><span>로그인</span></Link>;
  }

  const displayName =
    typeof user.user_metadata.full_name === "string"
      ? user.user_metadata.full_name
      : user.email?.split("@")[0] ?? "사용자";

  return <SignOutButton displayName={displayName} />;
}
