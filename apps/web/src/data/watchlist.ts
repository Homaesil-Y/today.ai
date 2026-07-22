import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

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

