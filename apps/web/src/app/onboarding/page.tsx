import { ArrowRight, Bell, Sparkles } from "lucide-react";
import type { Metadata, Route } from "next";
import { redirect } from "next/navigation";
import { safeNextPath } from "@/lib/navigation";
import { createClient } from "@/lib/supabase/server";
import { completeOnboarding } from "@/app/settings/actions";

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
  return <div className="onboarding-page"><section className="onboarding-card"><span className="brand-mark onboarding-brand"><Sparkles size={24} /></span><h1>{profile?.display_name ? `${profile.display_name}님, ` : ""}관심 있는 AI 분야를 알려주세요.</h1><p className="onboarding-copy">선택한 분야를 중심으로 관심 목록과 알림을 구성합니다. 지금 선택하지 않아도 괜찮습니다.</p><form action={completeOnboarding}><input type="hidden" name="next" value={nextPath} /><div className="choice-grid onboarding-choices">{(categories ?? []).map((category) => <label className="choice-card" key={category.slug}><input type="checkbox" name="categories" value={category.slug} /><span>{category.name}</span></label>)}</div><div className="onboarding-alert"><Bell size={18} /><label><input type="checkbox" name="dailyDigest" defaultChecked />매일 아침 주요 AI 트렌드 요약 받기</label><input type="hidden" name="surgeAlert" value="on" /><input type="hidden" name="digestTime" value="08:00" /></div><button className="button button-primary onboarding-submit" type="submit">설정 완료하고 시작하기 <ArrowRight size={17} /></button></form></section></div>;
}
