import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export interface WatchlistFolder {
  id: string;
  name: string;
  sortOrder: number;
  createdAt: string;
}

export interface WatchlistEntry {
  id: string;
  watchlistId: string;
  entityId: string;
  memo: string;
  savedScore: number | null;
  createdAt: string;
}

export async function getSavedEntityIds(): Promise<Set<string>> {
  if (!isSupabaseConfigured()) return new Set();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Set();

  const { data: watchlists } = await supabase.from("watchlists").select("id").eq("user_id", user.id);
  const ids = (watchlists ?? []).map(({ id }) => id);
  if (!ids.length) return new Set();

  const { data: items } = await supabase.from("watchlist_items").select("entity_id").in("watchlist_id", ids);
  return new Set((items ?? []).map(({ entity_id }) => entity_id));
}

export async function getWatchlistViewer() {
  if (!isSupabaseConfigured()) return { user: null, savedEntityIds: new Set<string>() };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, savedEntityIds: new Set<string>() };
  return { user, savedEntityIds: await getSavedEntityIds() };
}

export async function getWatchlistOverview() {
  if (!isSupabaseConfigured()) return { user: null, folders: [] as WatchlistFolder[], entries: [] as WatchlistEntry[] };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, folders: [] as WatchlistFolder[], entries: [] as WatchlistEntry[] };

  const { data: folderRows, error: folderError } = await supabase
    .from("watchlists")
    .select("id,name,sort_order,created_at")
    .eq("user_id", user.id)
    .order("sort_order")
    .order("created_at");
  if (folderError) throw new Error("관심 목록 폴더를 불러오지 못했습니다.");

  const folders = (folderRows ?? []).map((folder) => ({ id: folder.id, name: folder.name, sortOrder: folder.sort_order, createdAt: folder.created_at }));
  const folderIds = folders.map(({ id }) => id);
  if (!folderIds.length) return { user, folders, entries: [] as WatchlistEntry[] };

  const { data: itemRows, error: itemError } = await supabase
    .from("watchlist_items")
    .select("id,watchlist_id,entity_id,memo,saved_score,created_at")
    .in("watchlist_id", folderIds)
    .order("created_at", { ascending: false });
  if (itemError) throw new Error("관심 서비스를 불러오지 못했습니다.");

  const entries = (itemRows ?? []).map((item) => ({
    id: item.id,
    watchlistId: item.watchlist_id,
    entityId: item.entity_id,
    memo: item.memo ?? "",
    savedScore: item.saved_score === null ? null : Number(item.saved_score),
    createdAt: item.created_at,
  }));
  return { user, folders, entries };
}
