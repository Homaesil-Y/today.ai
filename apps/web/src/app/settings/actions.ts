"use server";

import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
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

export async function completeOnboarding(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/onboarding");
  await savePreferences(formData);
  const { error } = await supabase.from("user_profiles").update({ onboarding_completed: true, updated_at: new Date().toISOString() }).eq("id", user.id);
  if (error) throw new Error("온보딩을 완료하지 못했습니다.");
  const requestedNext = String(formData.get("next") ?? "/");
  const nextPath = requestedNext.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : "/";
  redirect(nextPath as Route);
}

