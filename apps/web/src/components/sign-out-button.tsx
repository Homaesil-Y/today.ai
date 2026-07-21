"use client";

import { CircleUserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton({ displayName }: { displayName: string }) {
  const router = useRouter();
  async function signOut() {
    await createClient().auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <button className="profile-button" type="button" onClick={signOut} title="클릭하여 로그아웃">
      <CircleUserRound size={22} />
      <span>{displayName}</span>
    </button>
  );
}
