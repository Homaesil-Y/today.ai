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

// 회원 탈퇴 확인 문구. 사용자가 직접 입력해야 진행된다.
const DELETE_CONFIRM_PHRASE = "탈퇴";

export type DeleteAccountState = { error: string };

// 설정 저장 핵심 로직. savePreferences(폼 액션)와 completeOnboarding이 공유한다.
async function persistPreferences(userId: string, formData: FormData): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const categories = categorySchema.parse(formData.getAll("categories").map(String));
  const digestTime = timeSchema.catch("08:00").parse(String(formData.get("digestTime") ?? "08:00"));
  const { error } = await supabase.from("user_preferences").upsert({
    user_id: userId,
    preferred_categories_json: categories,
    daily_digest_enabled: formData.get("dailyDigest") === "on",
    surge_alert_enabled: formData.get("surgeAlert") === "on",
    digest_time: digestTime,
    timezone: "Asia/Seoul",
    theme: "light",
  });
  return { error: error ? "설정을 저장하지 못했습니다." : null };
}

// 저장 후 PRG(Post/Redirect/Get)로 ?saved=1에 리다이렉트해 성공 토스트를 띄운다.
// 새로고침 시 재제출을 막고, useFormStatus로 제출 중 상태를 표시한다.
export async function savePreferences(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/settings");
  const { error } = await persistPreferences(user.id, formData);
  if (error) throw new Error(error);
  revalidatePath("/settings");
  redirect("/settings?saved=1" as Route);
}

export async function deleteAccount(_prev: DeleteAccountState, formData: FormData): Promise<DeleteAccountState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/settings");

  // 2단계 확인: 체크박스 + 확인 문구 직접 입력. 실수로 인한 영구 삭제를 방지한다.
  if (formData.get("confirm") !== "on") return { error: "확인란을 선택해야 회원 탈퇴를 진행할 수 있습니다." };
  if (String(formData.get("confirmText") ?? "").trim() !== DELETE_CONFIRM_PHRASE) {
    return { error: `확인을 위해 '${DELETE_CONFIRM_PHRASE}'를 정확히 입력해주세요.` };
  }

  // auth 사용자 삭제 시 user_profiles·user_preferences·watchlists·watchlist_items·notifications가
  // on delete cascade로 함께 삭제된다.
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return { error: "회원 탈퇴를 처리하지 못했습니다. 잠시 후 다시 시도해주세요." };

  await supabase.auth.signOut();
  redirect("/?goodbye=1" as Route);
}

export async function completeOnboarding(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/onboarding");
  const { error: prefError } = await persistPreferences(user.id, formData);
  if (prefError) throw new Error(prefError);
  const { error } = await supabase.from("user_profiles").update({ onboarding_completed: true, updated_at: new Date().toISOString() }).eq("id", user.id);
  if (error) throw new Error("온보딩을 완료하지 못했습니다.");
  const nextPath = safeNextPath(formData.get("next"));
  redirect(nextPath as Route);
}

