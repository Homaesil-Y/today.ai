import { loadWorkspaceEnvironment } from "@ai-trend-radar/collectors";
import { createCategoryClassifierFromEnv } from "@ai-trend-radar/llm";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

// 기존 공개 엔티티의 카테고리를 LLM으로 재분류한다. 전체를 배치로 묶어 최소 호출 수(수십 건당 1콜)만 사용.
// 사용법: pnpm reclassify        (실제 반영)
//        pnpm reclassify --dry  (변경 예정만 출력, 쓰기 없음)

const env = loadWorkspaceEnvironment();
const dryRun = process.argv.includes("--dry");

const url = env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!url || !key) {
  process.stderr.write("Supabase URL과 서버 비밀키가 필요합니다.\n");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const catRows = z.array(z.object({ id: z.string(), slug: z.string() })).parse(
  (await supabase.from("categories").select("id,slug").eq("enabled", true)).data ?? [],
);
const slugToId = new Map(catRows.map((c) => [c.slug, c.id]));
const idToSlug = new Map(catRows.map((c) => [c.id, c.slug]));

const entRows = z.array(z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  category_id: z.string().nullable(),
})).parse((await supabase.from("entities").select("id,name,description,category_id").eq("visibility", "public")).data ?? []);

if (entRows.length === 0) {
  process.stdout.write("공개 엔티티가 없습니다.\n");
  process.exit(0);
}

const classifier = createCategoryClassifierFromEnv(env);
const results = await classifier.classify(
  entRows.map((entity, index) => ({ index, name: entity.name, description: (entity.description ?? "").slice(0, 500) })),
);
const slugByIndex = new Map(results.map((r) => [r.index, r.categorySlug]));

const changes: { name: string; from: string; to: string }[] = [];
for (let i = 0; i < entRows.length; i += 1) {
  const entity = entRows[i]!;
  const newSlug = slugByIndex.get(i);
  if (!newSlug) continue;
  const newId = slugToId.get(newSlug);
  if (!newId || newId === entity.category_id) continue;
  changes.push({ name: entity.name.slice(0, 48), from: (entity.category_id ? idToSlug.get(entity.category_id) : null) ?? "(none)", to: newSlug });
  if (!dryRun) {
    const { error } = await supabase.from("entities").update({ category_id: newId, updated_at: new Date().toISOString() }).eq("id", entity.id);
    if (error) process.stderr.write(`업데이트 실패 [${entity.name}]: ${error.message}\n`);
  }
}

process.stdout.write(`${JSON.stringify({ total: entRows.length, changed: changes.length, dryRun, changes }, null, 2)}\n`);
