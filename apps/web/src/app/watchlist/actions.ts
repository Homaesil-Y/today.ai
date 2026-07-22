"use server";

import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const uuidSchema = z.string().uuid();
const folderNameSchema = z.string().trim().min(1).max(40);
const memoSchema = z.string().trim().max(500);

export type WatchActionResult = { ok: true; saved: boolean } | { ok: false; saved: boolean; requiresAuth?: boolean; message: string };

async function authenticatedClient(next = "/watchlist") {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}` as Route);
  return { supabase, user };
}

function refreshWatchlist() {
  revalidatePath("/");
  revalidatePath("/explore");
  revalidatePath("/watchlist");
}

export async function setWatchlistItem(entityId: string, shouldSave: boolean): Promise<WatchActionResult> {
  const parsed = uuidSchema.safeParse(entityId);
  if (!parsed.success) return { ok: false, saved: !shouldSave, message: "서비스 식별자가 올바르지 않습니다." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, saved: false, requiresAuth: true, message: "로그인이 필요합니다." };

  let { data: watchlists, error: watchlistError } = await supabase
    .from("watchlists")
    .select("id")
    .eq("user_id", user.id)
    .order("sort_order")
    .order("created_at");

  if (!watchlists?.length && !watchlistError) {
    const created = await supabase.from("watchlists").insert({ user_id: user.id, name: "전체", sort_order: 0 }).select("id").single();
    watchlists = created.data ? [created.data] : [];
    watchlistError = created.error;
  }
  const defaultWatchlist = watchlists?.[0];
  if (!defaultWatchlist || watchlistError) return { ok: false, saved: !shouldSave, message: "관심 목록을 준비하지 못했습니다." };
  const ownedWatchlistIds = (watchlists ?? [defaultWatchlist]).map(({ id }) => id);

  if (shouldSave) {
    const { data: score } = await supabase.from("trend_scores").select("total_score").eq("entity_id", parsed.data).order("calculated_at", { ascending: false }).limit(1).maybeSingle();
    const { error } = await supabase.from("watchlist_items").upsert({ watchlist_id: defaultWatchlist.id, entity_id: parsed.data, saved_score: score?.total_score ?? null }, { onConflict: "watchlist_id,entity_id" });
    if (error) return { ok: false, saved: false, message: "관심 목록에 저장하지 못했습니다." };
  } else {
    const { error } = await supabase.from("watchlist_items").delete().in("watchlist_id", ownedWatchlistIds).eq("entity_id", parsed.data);
    if (error) return { ok: false, saved: true, message: "관심 목록에서 제거하지 못했습니다." };
  }

  refreshWatchlist();
  return { ok: true, saved: shouldSave };
}

export async function createWatchlist(formData: FormData) {
  const name = folderNameSchema.parse(String(formData.get("name") ?? ""));
  const { supabase, user } = await authenticatedClient();
  const { data: duplicate } = await supabase.from("watchlists").select("id").eq("user_id", user.id).ilike("name", name).limit(1).maybeSingle();
  if (duplicate) throw new Error("같은 이름의 폴더가 이미 있습니다.");
  const { data: latest } = await supabase.from("watchlists").select("sort_order").eq("user_id", user.id).order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const { error } = await supabase.from("watchlists").insert({ user_id: user.id, name, sort_order: (latest?.sort_order ?? -1) + 1 });
  if (error) throw new Error(error.code === "23505" ? "같은 이름의 폴더가 이미 있습니다." : "폴더를 만들지 못했습니다.");
  refreshWatchlist();
}

export async function updateWatchlistEntry(formData: FormData) {
  const itemId = uuidSchema.parse(String(formData.get("itemId") ?? ""));
  const watchlistId = uuidSchema.parse(String(formData.get("watchlistId") ?? ""));
  const memo = memoSchema.parse(String(formData.get("memo") ?? ""));
  const { supabase } = await authenticatedClient();
  const { error } = await supabase.from("watchlist_items").update({ watchlist_id: watchlistId, memo: memo || null }).eq("id", itemId);
  if (error) throw new Error(error.code === "23505" ? "해당 폴더에 이미 저장된 서비스입니다." : "관심 서비스 정보를 저장하지 못했습니다.");
  refreshWatchlist();
}

export async function deleteEmptyWatchlist(formData: FormData) {
  const watchlistId = uuidSchema.parse(String(formData.get("watchlistId") ?? ""));
  const { supabase, user } = await authenticatedClient();
  const { data: folder } = await supabase.from("watchlists").select("id,name,sort_order").eq("id", watchlistId).eq("user_id", user.id).maybeSingle();
  if (!folder || folder.sort_order === 0 || folder.name === "전체") throw new Error("기본 폴더는 삭제할 수 없습니다.");
  const { count } = await supabase.from("watchlist_items").select("id", { count: "exact", head: true }).eq("watchlist_id", watchlistId);
  if ((count ?? 0) > 0) throw new Error("서비스를 다른 폴더로 이동한 뒤 삭제해주세요.");
  const { error } = await supabase.from("watchlists").delete().eq("id", watchlistId).eq("user_id", user.id);
  if (error) throw new Error("폴더를 삭제하지 못했습니다.");
  refreshWatchlist();
}
