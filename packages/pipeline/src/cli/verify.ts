import { createClient } from "@supabase/supabase-js";
import { loadWorkspaceEnvironment } from "@ai-trend-radar/collectors";

const env = loadWorkspaceEnvironment();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = env.SUPABASE_SECRET_KEY;

if (!url || !secretKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required");
}

const client = createClient(url, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const tables = [
  "raw_items",
  "entities",
  "entity_mentions",
  "metric_snapshots",
  "trend_scores",
  "ai_analyses",
] as const;

const counts: Record<(typeof tables)[number], number> = {
  raw_items: 0,
  entities: 0,
  entity_mentions: 0,
  metric_snapshots: 0,
  trend_scores: 0,
  ai_analyses: 0,
};

for (const table of tables) {
  const result = await client.from(table).select("id", { count: "exact", head: true });
  if (result.error) {
    throw new Error(`Failed to count ${table}: ${result.error.message}`);
  }
  counts[table] = result.count ?? 0;
}

process.stdout.write(`${JSON.stringify(counts, null, 2)}\n`);
