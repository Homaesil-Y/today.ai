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
