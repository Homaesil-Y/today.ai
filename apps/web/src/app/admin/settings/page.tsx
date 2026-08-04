import { Cpu } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { z } from "zod";
import { SubmitButton } from "@/components/submit-button";
import { Toast } from "@/components/toast";
import { getCurrentUserRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { updateTrendAnalysisProvider } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "LLM 설정", robots: { index: false, follow: false } };

const settingSchema = z.object({
  provider: z.enum(["gemini", "groq"]).catch("gemini"),
  model: z.string().trim().min(1).nullable().optional().catch(null),
});

const PROVIDER_LABELS: Record<string, string> = { gemini: "Google Gemini", groq: "Groq" };
const PROVIDER_DEFAULT_MODELS: Record<string, string> = {
  gemini: "gemini-3.1-flash-lite",
  groq: "openai/gpt-oss-20b",
};

export default async function AdminSettingsPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const saved = (await searchParams).saved === "1";
  const { user, role } = await getCurrentUserRole();
  if (!user) redirect("/login?next=/admin/settings");
  if (role !== "admin") redirect("/");

  const supabase = createAdminClient();
  const { data } = await supabase.from("app_settings").select("value, updated_at").eq("key", "trend_analysis_llm").maybeSingle();
  const setting = settingSchema.parse(data?.value ?? {});

  return (
    <div className="page admin-page">
      {saved && <Toast message="LLM 설정을 저장했습니다." clearParam="saved" />}
      <section className="page-heading">
        <div>
          <h1>LLM 설정</h1>
          <p>트렌드 분석에 사용할 LLM 프로바이더를 선택하세요. 다음 파이프라인 실행부터 적용됩니다.</p>
        </div>
      </section>

      <section className="panel preference-section">
        <div className="preference-title">
          <Cpu size={20} />
          <div>
            <h2>트렌드 분석 프로바이더</h2>
            <p>API 키는 여기서 입력하지 않습니다 — GitHub Secrets(GEMINI_API_KEY / GROQ_API_KEY)에 미리 등록되어 있어야 해당 프로바이더가 실제로 동작합니다.</p>
          </div>
        </div>

        <form className="preference-form" action={updateTrendAnalysisProvider}>
          <fieldset className="llm-provider-choices">
            {(["gemini", "groq"] as const).map((provider) => (
              <label className="llm-provider-card" key={provider}>
                <input type="radio" name="provider" value={provider} defaultChecked={setting.provider === provider} required />
                <div>
                  <strong>{PROVIDER_LABELS[provider]}</strong>
                  <small>기본 모델: {PROVIDER_DEFAULT_MODELS[provider]}</small>
                </div>
              </label>
            ))}
          </fieldset>

          <label className="llm-model-field">
            <span>모델 이름(선택)</span>
            <input
              type="text"
              name="model"
              defaultValue={setting.model ?? ""}
              placeholder="비워두면 프로바이더 기본 모델을 사용합니다"
              maxLength={120}
            />
          </label>

          <SubmitButton className="button button-primary" pendingLabel="저장 중…">저장</SubmitButton>
        </form>

        <p className="settings-legal">
          현재 값: <strong>{PROVIDER_LABELS[setting.provider]}</strong>
          {setting.model && <> · <code>{setting.model}</code></>}
          {data?.updated_at && <> · 마지막 변경 {new Date(data.updated_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</>}
        </p>
      </section>
    </div>
  );
}
