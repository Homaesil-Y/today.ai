"use server";

import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeNextPath, withParam } from "@/lib/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const categorySchema = z.array(z.string().min(1).max(80)).max(20);
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

// 회원 탈퇴 확인 문구. 사용자가 직접 입력해야 진행된다.
const DELETE_CONFIRM_PHRASE = "탈퇴";

export type DeleteAccountState = { error: string };
export type OnboardingFormState = { error: string };

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
  // daily_digest/surge_alert는 AnalyticsPageView가 도착 페이지에서 save_preferences 이벤트에 실어보내고
  // 스스로 지운다. URL로만 값이 넘어오므로(폼 데이터는 서버에서만 접근 가능) 여기서 리다이렉트에 싣는다.
  const dailyDigest = formData.get("dailyDigest") === "on" ? "1" : "0";
  const surgeAlert = formData.get("surgeAlert") === "on" ? "1" : "0";
  redirect(withParam(withParam(withParam("/settings", "saved", "1"), "daily_digest", dailyDigest), "surge_alert", surgeAlert) as Route);
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

// 최초 가입 시 1회만 동의를 받는다(재로그인마다 다시 받을 필요는 없음). onboarding_completed가 이미 true면
// 이 액션에 도달하기 전에 페이지 자체가 리다이렉트하므로, 여기 도달한다는 것 자체가 신규 가입자라는 뜻이다.
export async function completeOnboarding(_prev: OnboardingFormState, formData: FormData): Promise<OnboardingFormState> {
  if (formData.get("agreeTerms") !== "on") return { error: "이용약관 및 개인정보처리방침에 동의해야 시작할 수 있습니다." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/onboarding");
  const { error: prefError } = await persistPreferences(user.id, formData);
  if (prefError) throw new Error(prefError);
  const { error } = await supabase.from("user_profiles").update({ onboarding_completed: true, updated_at: new Date().toISOString() }).eq("id", user.id);
  if (error) throw new Error("온보딩을 완료하지 못했습니다.");
  const nextPath = safeNextPath(formData.get("next"));
  // onboarded=1·categories_count는 AnalyticsPageView가 도착 페이지에서 감지해
  // complete_onboarding 이벤트에 실어보내고 스스로 지운다.
  const categoriesCount = String(formData.getAll("categories").length);
  redirect(withParam(withParam(nextPath, "onboarded", "1"), "categories_count", categoriesCount) as Route);
}

