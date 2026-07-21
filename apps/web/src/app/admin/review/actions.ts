"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUserRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const entityIdSchema = z.string().uuid();

async function setVisibility(formData: FormData, visibility: "public" | "private") {
  const entityId = entityIdSchema.parse(formData.get("entityId"));
  const { role } = await getCurrentUserRole();
  if (role !== "admin") throw new Error("관리자 권한이 필요합니다.");

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("entities")
    .update({ visibility, updated_at: new Date().toISOString() })
    .eq("id", entityId)
    .eq("visibility", "review");

  if (error) throw new Error(`후보 상태 변경 실패: ${error.message}`);
  revalidatePath("/");
  revalidatePath("/explore");
  revalidatePath("/admin/review");
}

export async function approveCandidate(formData: FormData) {
  const entityId = entityIdSchema.parse(formData.get("entityId"));
  const { role } = await getCurrentUserRole();
  if (role !== "admin") throw new Error("관리자 권한이 필요합니다.");

  const supabase = createAdminClient();
  const { count, error } = await supabase
    .from("ai_analyses")
    .select("id", { count: "exact", head: true })
    .eq("entity_id", entityId);
  if (error) throw new Error(`AI 분석 상태 확인 실패: ${error.message}`);
  if (!count) throw new Error("AI 분석이 완료된 후보만 공개할 수 있습니다.");

  await setVisibility(formData, "public");
}

export async function rejectCandidate(formData: FormData) {
  await setVisibility(formData, "private");
}
