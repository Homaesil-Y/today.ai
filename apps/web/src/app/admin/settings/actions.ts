"use server";

import type { Route } from "next";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentUserRole } from "@/lib/auth";
import { withParam } from "@/lib/navigation";
import { createAdminClient } from "@/lib/supabase/admin";

// pipeline/src/llm-provider-settings.ts와 같은 키를 쓴다. 패키지 의존 없이 상수만 맞춰서 쓴다
// (apps/web은 파이프라인 패키지를 참조하지 않는 얇은 DB 클라이언트라 새 워크스페이스 의존을
// 추가하지 않는다).
const TREND_ANALYSIS_LLM_SETTING_KEY = "trend_analysis_llm";

const formSchema = z.object({
  provider: z.enum(["gemini", "groq"]),
  model: z.string().trim().max(120),
});

export async function updateTrendAnalysisProvider(formData: FormData) {
  const { user, role } = await getCurrentUserRole();
  if (!user) redirect("/login?next=/admin/settings");
  if (role !== "admin") redirect("/");

  const parsed = formSchema.safeParse({
    provider: formData.get("provider"),
    model: formData.get("model") ?? "",
  });
  if (!parsed.success) throw new Error("입력값이 올바르지 않습니다.");

  const supabase = createAdminClient();
  const { error } = await supabase.from("app_settings").upsert({
    key: TREND_ANALYSIS_LLM_SETTING_KEY,
    value: { provider: parsed.data.provider, model: parsed.data.model || null },
    updated_at: new Date().toISOString(),
    updated_by: user.id,
  });
  if (error) throw new Error(`설정 저장 실패: ${error.message}`);

  redirect(withParam("/admin/settings", "saved", "1") as Route);
}
