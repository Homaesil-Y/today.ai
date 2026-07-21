import { createClient } from "@supabase/supabase-js";
import { loadWorkspaceEnvironment } from "@ai-trend-radar/collectors";
import { z } from "zod";

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).parse(process.argv.at(-1));
const env = loadWorkspaceEnvironment();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = env.SUPABASE_SECRET_KEY;

if (!url || !secretKey) throw new Error("Supabase server environment is required");

const client = createClient(url, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: entity, error: findError } = await client
  .from("entities")
  .select("id, name, slug, visibility, ai_analyses(id)")
  .eq("slug", slug)
  .single();

if (findError) throw new Error(`Candidate lookup failed: ${findError.message}`);
if (entity.visibility !== "review") throw new Error(`Candidate is not in review: ${entity.visibility}`);
if (!entity.ai_analyses?.length) throw new Error("Candidate must have a validated AI analysis before publication");

const { error: updateError } = await client
  .from("entities")
  .update({ visibility: "public", updated_at: new Date().toISOString() })
  .eq("id", entity.id)
  .eq("visibility", "review");

if (updateError) throw new Error(`Candidate publication failed: ${updateError.message}`);
process.stdout.write(`${JSON.stringify({ id: entity.id, name: entity.name, slug, visibility: "public" })}\n`);
