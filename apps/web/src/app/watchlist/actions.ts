"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const entityIdSchema = z.string().uuid();

export type WatchActionResult = { ok: true; saved: boolean } | { ok: false; saved: boolean; requiresAuth?: boolean; message: string };

export async function setWatchlistItem(entityId: string, shouldSave: boolean): Promise<WatchActionResult> {
  const parsed = entityIdSchema.safeParse(entityId);
  if (!parsed.success) return { ok: false, saved: !shouldSave, message: "서비스 식별자가 올바르지 않습니다." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, saved: false, requiresAuth: true, message: "로그인이 필요합니다." };

  let { data: watchlist, error: watchlistError } = await supabase
    .from("watchlists")
    .select("id")
    .eq("user_id", user.id)
    .order("sort_order")
    .limit(1)
    .maybeSingle();

  if (!watchlist && !watchlistError) {
    const created = await supabase.from("watchlists").insert({ user_id: user.id, name: "전체", sort_order: 0 }).select("id").single();
    watchlist = created.data;
    watchlistError = created.error;
  }
  if (!watchlist || watchlistError) return { ok: false, saved: !shouldSave, message: "관심 목록을 준비하지 못했습니다." };

  if (shouldSave) {
    const { data: score } = await supabase.from("trend_scores").select("total_score").eq("entity_id", parsed.data).order("calculated_at", { ascending: false }).limit(1).maybeSingle();
    const { error } = await supabase.from("watchlist_items").upsert({ watchlist_id: watchlist.id, entity_id: parsed.data, saved_score: score?.total_score ?? null }, { onConflict: "watchlist_id,entity_id" });
    if (error) return { ok: false, saved: false, message: "관심 목록에 저장하지 못했습니다." };
  } else {
    const { error } = await supabase.from("watchlist_items").delete().eq("watchlist_id", watchlist.id).eq("entity_id", parsed.data);
    if (error) return { ok: false, saved: true, message: "관심 목록에서 제거하지 못했습니다." };
  }

  revalidatePath("/");
  revalidatePath("/explore");
  revalidatePath("/watchlist");
  return { ok: true, saved: shouldSave };
}
