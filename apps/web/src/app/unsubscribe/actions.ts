"use server";

import type { Route } from "next";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyUnsubscribeToken } from "@/lib/unsubscribe-token";

export async function unsubscribe(formData: FormData) {
  const userId = String(formData.get("u") ?? "");
  const token = String(formData.get("t") ?? "");
  if (!userId || !token || !verifyUnsubscribeToken(userId, token)) redirect("/unsubscribe" as Route);

  const admin = createAdminClient();
  const { error } = await admin.from("user_preferences").update({ daily_digest_enabled: false }).eq("user_id", userId);
  if (error) throw new Error("구독 해지를 처리하지 못했습니다.");

  redirect("/unsubscribe?done=1" as Route);
}
