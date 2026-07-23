import { loadWorkspaceEnvironment } from "@ai-trend-radar/collectors";
import { createCategorySuggesterFromEnv } from "@ai-trend-radar/llm";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

// '기타'로 분류된 공개 서비스에서 새 카테고리 후보를 발굴해 category_suggestions에 쌓는다.
// 자동 생성이 아니라 '제안'만 한다 — 관리자가 /admin/categories에서 승인해야 실제 카테고리가 된다.
// 사용법: pnpm suggest:categories [--dry]

const env = loadWorkspaceEnvironment();
const dryRun = process.argv.includes("--dry");

const url = env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!url || !key) {
  process.stderr.write("Supabase URL과 서버 비밀키가 필요합니다.\n");
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const cats = z.array(z.object({ id: z.string(), slug: z.string(), name: z.string() })).parse(
  (await supabase.from("categories").select("id,slug,name").eq("enabled", true).order("sort_order")).data ?? [],
);
const otherId = cats.find((c) => c.slug === "other")?.id;
const existing = cats.map((c) => ({ slug: c.slug, label: c.name }));

const otherRows = otherId
  ? z.array(z.object({ name: z.string(), description: z.string().nullable() })).parse(
      (await supabase.from("entities").select("name,description").eq("visibility", "public").eq("category_id", otherId)).data ?? [],
    )
  : [];

if (otherRows.length === 0) {
  process.stdout.write("분석할 '기타' 서비스가 없습니다.\n");
  process.exit(0);
}

const suggester = createCategorySuggesterFromEnv(env);
const suggestions = await suggester.suggest(
  otherRows.map((e) => ({ name: e.name, description: (e.description ?? "").slice(0, 300) })),
  existing,
);

// 이미 카테고리로 존재하거나, 이미 처리(승인/기각)된 제안 slug는 제외한다.
const existingCatSlugs = new Set(cats.map((c) => c.slug));
const priorSuggestions = z.array(z.object({ slug: z.string(), status: z.string() })).parse(
  (await supabase.from("category_suggestions").select("slug,status")).data ?? [],
);
const resolved = new Set(priorSuggestions.filter((s) => s.status !== "pending").map((s) => s.slug));

const fresh = suggestions.filter((s) => !existingCatSlugs.has(s.slug) && !resolved.has(s.slug));

if (!dryRun && fresh.length > 0) {
  const { error } = await supabase.from("category_suggestions").upsert(
    fresh.map((s) => ({ slug: s.slug, label: s.label, rationale: s.rationale, example_names_json: s.exampleNames, service_count: s.exampleNames.length, status: "pending", updated_at: new Date().toISOString() })),
    { onConflict: "slug" },
  );
  if (error) {
    process.stderr.write(`제안 저장 실패: ${error.message}\n`);
    process.exit(1);
  }
}

process.stdout.write(`${JSON.stringify({ analyzed: otherRows.length, proposed: suggestions.length, saved: dryRun ? 0 : fresh.length, dryRun, suggestions: fresh }, null, 2)}\n`);
