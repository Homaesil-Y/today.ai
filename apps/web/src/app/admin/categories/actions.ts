"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUserRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export type SuggestionActionState = { error: string; ok?: boolean };

const idSchema = z.string().uuid();

async function requireAdmin() {
  const { role } = await getCurrentUserRole();
  if (role !== "admin") throw new Error("관리자 권한이 필요합니다.");
}

// 제안 승인 → categories에 실제 카테고리로 추가(enabled). 분류기 taxonomy는 DB 기반이라 다음 분석부터 바로 사용된다.
export async function approveSuggestion(_prev: SuggestionActionState, formData: FormData): Promise<SuggestionActionState> {
  await requireAdmin();
  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return { error: "요청이 올바르지 않습니다." };
  const supabase = createAdminClient();
  const now = new Date().toISOString();

  const { data: suggestion, error } = await supabase
    .from("category_suggestions")
    .select("slug,label,status")
    .eq("id", id.data)
    .maybeSingle();
  if (error || !suggestion) return { error: "제안을 찾을 수 없습니다." };
  if (suggestion.status !== "pending") return { error: "이미 처리된 제안입니다." };

  const { data: existing } = await supabase.from("categories").select("id").eq("slug", suggestion.slug).maybeSingle();
  if (existing) {
    await supabase.from("category_suggestions").update({ status: "approved", updated_at: now }).eq("id", id.data);
    return { error: "이미 같은 slug의 카테고리가 있어 제안만 정리했습니다." };
  }

  const { data: top } = await supabase.from("categories").select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const sortOrder = (top?.sort_order ?? 0) + 1;
  const { error: insertError } = await supabase.from("categories").insert({ name: suggestion.label, slug: suggestion.slug, sort_order: sortOrder, enabled: true });
  if (insertError) return { error: `카테고리 생성 실패: ${insertError.message}` };

  await supabase.from("category_suggestions").update({ status: "approved", updated_at: now }).eq("id", id.data);
  revalidatePath("/admin/categories");
  revalidatePath("/categories");
  revalidatePath("/explore");
  return { error: "", ok: true };
}

export async function dismissSuggestion(_prev: SuggestionActionState, formData: FormData): Promise<SuggestionActionState> {
  await requireAdmin();
  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return { error: "요청이 올바르지 않습니다." };
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("category_suggestions")
    .update({ status: "dismissed", updated_at: new Date().toISOString() })
    .eq("id", id.data)
    .eq("status", "pending");
  if (error) return { error: "처리에 실패했습니다." };
  revalidatePath("/admin/categories");
  return { error: "", ok: true };
}
