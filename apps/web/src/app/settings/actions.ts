"use server";

import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeNextPath } from "@/lib/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const categorySchema = z.array(z.string().min(1).max(80)).max(20);
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export async function savePreferences(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/settings");

  const categories = categorySchema.parse(formData.getAll("categories").map(String));
  const digestTime = timeSchema.catch("08:00").parse(String(formData.get("digestTime") ?? "08:00"));
  const { error } = await supabase.from("user_preferences").upsert({
    user_id: user.id,
    preferred_categories_json: categories,
    daily_digest_enabled: formData.get("dailyDigest") === "on",
    surge_alert_enabled: formData.get("surgeAlert") === "on",
    digest_time: digestTime,
    timezone: "Asia/Seoul",
    theme: "light",
  });
  if (error) throw new Error("설정을 저장하지 못했습니다.");
  revalidatePath("/settings");
}

export async function deleteAccount(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/settings");

  // 실수 방지: 확인 체크박스를 명시적으로 선택해야 진행한다.
  if (formData.get("confirm") !== "on") {
    throw new Error("회원 탈퇴를 진행하려면 확인란을 선택해야 합니다.");
  }

  // auth 사용자 삭제 시 user_profiles·user_preferences·watchlists·watchlist_items·notifications가
  // on delete cascade로 함께 삭제된다.
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) throw new Error(`회원 탈퇴를 처리하지 못했습니다: ${error.message}`);

  await supabase.auth.signOut();
  redirect("/?goodbye=1" as Route);
}

export async function completeOnboarding(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/onboarding");
  await savePreferences(formData);
  const { error } = await supabase.from("user_profiles").update({ onboarding_completed: true, updated_at: new Date().toISOString() }).eq("id", user.id);
  if (error) throw new Error("온보딩을 완료하지 못했습니다.");
  const nextPath = safeNextPath(formData.get("next"));
  redirect(nextPath as Route);
}

