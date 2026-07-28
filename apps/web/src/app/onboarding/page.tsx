import { Sparkles } from "lucide-react";
import type { Metadata, Route } from "next";
import { redirect } from "next/navigation";
import { safeNextPath } from "@/lib/navigation";
import { createClient } from "@/lib/supabase/server";
import { OnboardingForm } from "./onboarding-form";

export const metadata: Metadata = { title: "관심 분야 설정", robots: { index: false, follow: false } };

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const nextPath = safeNextPath((await searchParams).next);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/onboarding?next=${nextPath}`)}` as Route);
  const [{ data: profile }, { data: categories }] = await Promise.all([
    supabase.from("user_profiles").select("display_name,onboarding_completed").eq("id", user.id).maybeSingle(),
    supabase.from("categories").select("name,slug").eq("enabled", true).order("sort_order"),
  ]);
  if (profile?.onboarding_completed) redirect(nextPath as Route);
  return (
    <div className="onboarding-page">
      <section className="onboarding-card">
        <span className="brand-mark onboarding-brand"><Sparkles size={24} /></span>
        <h1>{profile?.display_name ? `${profile.display_name}님, ` : ""}관심 있는 AI 분야를 알려주세요.</h1>
        <p className="onboarding-copy">선택한 분야를 중심으로 관심 목록과 알림을 구성합니다. 지금 선택하지 않아도 괜찮습니다.</p>
        <OnboardingForm categories={categories ?? []} nextPath={nextPath} />
      </section>
    </div>
  );
}
