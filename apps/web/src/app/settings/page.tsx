import { Bell, CheckCircle2, ShieldAlert, SlidersHorizontal } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SubmitButton } from "@/components/submit-button";
import { Toast } from "@/components/toast";
import { createClient } from "@/lib/supabase/server";
import { savePreferences } from "./actions";
import { AccountDeleteForm } from "./account-delete-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "개인 설정", robots: { index: false, follow: false } };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const saved = (await searchParams).saved === "1";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/settings");
  const [{ data: profile }, { data: preferences }, { data: categories }] = await Promise.all([
    supabase.from("user_profiles").select("display_name,email").eq("id", user.id).maybeSingle(),
    supabase.from("user_preferences").select("preferred_categories_json,daily_digest_enabled,surge_alert_enabled,digest_time,timezone").eq("user_id", user.id).maybeSingle(),
    supabase.from("categories").select("name,slug").eq("enabled", true).order("sort_order"),
  ]);
  const selected = new Set(Array.isArray(preferences?.preferred_categories_json) ? preferences.preferred_categories_json.filter((value): value is string => typeof value === "string") : []);
  return <div className="page content-page">{saved && <Toast message="설정을 저장했습니다." clearParam="saved" />}<section className="page-heading"><div><h1>설정</h1><p>{profile?.display_name ?? user.email}님의 관심 분야와 알림 기준을 관리합니다.</p></div></section><form className="preference-form" action={savePreferences}><section className="panel preference-section"><div className="preference-title"><SlidersHorizontal size={20} /><div><h2>관심 카테고리</h2><p>선택하지 않아도 전체 트렌드를 계속 볼 수 있습니다.</p></div></div><div className="choice-grid">{(categories ?? []).map((category) => <label className="choice-card" key={category.slug}><input type="checkbox" name="categories" value={category.slug} defaultChecked={selected.has(category.slug)} /><span>{category.name}</span></label>)}</div></section><section className="panel preference-section"><div className="preference-title"><Bell size={20} /><div><h2>알림</h2><p>이메일 발송 연결 전에도 원하는 기준을 미리 저장할 수 있습니다.</p></div></div><label className="toggle-row"><span><strong>매일 아침 요약</strong><small>선택한 카테고리의 주요 변화를 요약합니다.</small></span><input type="checkbox" name="dailyDigest" defaultChecked={preferences?.daily_digest_enabled ?? true} /></label><label className="toggle-row"><span><strong>급상승 알림</strong><small>관심 서비스가 급상승 상태가 되면 알립니다.</small></span><input type="checkbox" name="surgeAlert" defaultChecked={preferences?.surge_alert_enabled ?? true} /></label><label className="time-row"><span>요약 기준 시간</span><input type="time" name="digestTime" defaultValue={String(preferences?.digest_time ?? "08:00").slice(0, 5)} /></label></section><SubmitButton className="button button-primary preference-save" pendingLabel="저장 중…"><CheckCircle2 size={17} />설정 저장</SubmitButton></form><section className="panel danger-section"><div className="preference-title"><ShieldAlert size={20} /><div><h2>회원 탈퇴</h2><p>계정과 관심 목록·폴더·메모·알림 설정이 즉시 영구 삭제되며 복구할 수 없습니다. 공개 서비스 데이터는 개인 정보가 아니므로 그대로 유지됩니다.</p></div></div><AccountDeleteForm /></section><p className="settings-legal">개인정보 처리 방침과 이용약관은 <Link href="/privacy">개인정보처리방침</Link> · <Link href="/terms">이용약관</Link>에서 확인할 수 있습니다.</p></div>;
}
