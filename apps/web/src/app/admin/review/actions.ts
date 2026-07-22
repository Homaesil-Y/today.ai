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

const updateSchema = z.object({
  entityId: z.string().uuid(),
  name: z.string().trim().min(2, "이름은 2자 이상이어야 합니다.").max(120),
  description: z.string().trim().max(2000).nullable(),
  categorySlug: z.string().trim().min(1).max(80).nullable(),
});

export async function updateCandidate(formData: FormData) {
  const { role } = await getCurrentUserRole();
  if (role !== "admin") throw new Error("관리자 권한이 필요합니다.");

  const rawDescription = String(formData.get("description") ?? "").trim();
  const rawCategory = String(formData.get("categorySlug") ?? "").trim();
  const input = updateSchema.parse({
    entityId: formData.get("entityId"),
    name: String(formData.get("name") ?? ""),
    description: rawDescription === "" ? null : rawDescription,
    categorySlug: rawCategory === "" ? null : rawCategory,
  });

  const supabase = createAdminClient();

  let categoryId: string | null = null;
  if (input.categorySlug) {
    const { data: category, error: categoryError } = await supabase
      .from("categories")
      .select("id")
      .eq("slug", input.categorySlug)
      .maybeSingle();
    if (categoryError) throw new Error(`카테고리 조회 실패: ${categoryError.message}`);
    if (!category) throw new Error("존재하지 않는 카테고리입니다.");
    categoryId = category.id;
  }

  const { error } = await supabase
    .from("entities")
    .update({
      name: input.name,
      description: input.description,
      ...(categoryId ? { category_id: categoryId } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.entityId)
    .eq("visibility", "review");
  if (error) throw new Error(`후보 수정 실패: ${error.message}`);

  revalidatePath("/admin/review");
}

export async function dismissStaleCandidates() {
  const { role } = await getCurrentUserRole();
  if (role !== "admin") throw new Error("관리자 권한이 필요합니다.");

  const supabase = createAdminClient();
  // 48시간 넘게 review 상태로 남아있고 한 번도 분석되지 않은 후보 = 현재 수집 근거가 없어
  // 자동 분석·승인이 불가능한 잔여 후보. 이를 private로 정리한다(재수집되면 다시 살아난다).
  const cutoff = new Date(Date.now() - 48 * 3_600_000).toISOString();
  const [{ data: reviewRows, error: reviewError }, { data: analysisRows, error: analysisError }] = await Promise.all([
    supabase.from("entities").select("id").eq("visibility", "review").lt("last_detected_at", cutoff),
    supabase.from("ai_analyses").select("entity_id"),
  ]);
  if (reviewError) throw new Error(`후보 조회 실패: ${reviewError.message}`);
  if (analysisError) throw new Error(`분석 조회 실패: ${analysisError.message}`);

  const analyzed = new Set((analysisRows ?? []).map((row) => row.entity_id));
  const staleIds = (reviewRows ?? []).map((row) => row.id).filter((id) => !analyzed.has(id));
  if (staleIds.length > 0) {
    const { error } = await supabase
      .from("entities")
      .update({ visibility: "private", updated_at: new Date().toISOString() })
      .in("id", staleIds)
      .eq("visibility", "review");
    if (error) throw new Error(`정리 실패: ${error.message}`);
  }
  revalidatePath("/admin/review");
}

export async function requestReanalysis(formData: FormData) {
  const entityId = entityIdSchema.parse(formData.get("entityId"));
  const { role } = await getCurrentUserRole();
  if (role !== "admin") throw new Error("관리자 권한이 필요합니다.");

  const supabase = createAdminClient();
  // 기존 분석을 제거하면 파이프라인이 해당 엔티티를 "미분석"으로 판단해
  // 다음 실행에서 최우선으로 재분석한다. review 상태로 되돌려 재분석 전까지 공개에서 제외한다.
  const { error: deleteError } = await supabase.from("ai_analyses").delete().eq("entity_id", entityId);
  if (deleteError) throw new Error(`기존 분석 삭제 실패: ${deleteError.message}`);

  const { error: visibilityError } = await supabase
    .from("entities")
    .update({ visibility: "review", updated_at: new Date().toISOString() })
    .eq("id", entityId);
  if (visibilityError) throw new Error(`재분석 대기 전환 실패: ${visibilityError.message}`);

  revalidatePath("/");
  revalidatePath("/explore");
  revalidatePath("/admin/review");
}
