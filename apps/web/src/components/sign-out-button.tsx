"use client";

import { CircleUserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { trackEvent } from "@/lib/analytics";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton({ displayName, avatarUrl }: { displayName: string; avatarUrl: string | null }) {
  const router = useRouter();
  const [imageFailed, setImageFailed] = useState(false);
  async function signOut() {
    trackEvent("logout", {});
    await createClient().auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <button className="profile-button" type="button" onClick={signOut} title="클릭하여 로그아웃">
      {avatarUrl && !imageFailed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="profile-avatar" src={avatarUrl} alt="" width={22} height={22} referrerPolicy="no-referrer" onError={() => setImageFailed(true)} />
      ) : (
        <CircleUserRound size={22} />
      )}
      <span>{displayName}</span>
    </button>
  );
}
