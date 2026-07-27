import type { User } from "@supabase/supabase-js";
import { CircleUserRound } from "lucide-react";
import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "./sign-out-button";

// 일반 구글 계정과 워크스페이스(GSuite) 계정 모두 프로필 사진 필드 위치가 다를 수 있어
// user_metadata뿐 아니라 identities의 원본 provider 데이터까지 순서대로 확인한다.
function getAvatarUrl(user: User): string | null {
  const metadata = user.user_metadata ?? {};
  if (typeof metadata.avatar_url === "string" && metadata.avatar_url) return metadata.avatar_url;
  if (typeof metadata.picture === "string" && metadata.picture) return metadata.picture;
  for (const identity of user.identities ?? []) {
    const data = identity.identity_data ?? {};
    if (typeof data.avatar_url === "string" && data.avatar_url) return data.avatar_url;
    if (typeof data.picture === "string" && data.picture) return data.picture;
  }
  return null;
}

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

  return <SignOutButton displayName={displayName} avatarUrl={getAvatarUrl(user)} />;
}
