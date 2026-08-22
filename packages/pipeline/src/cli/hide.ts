import { loadWorkspaceEnvironment } from "@ai-trend-radar/collectors";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { readAllPages } from "../query-chunks";

// 제품이 아닌 엔티티를 목록·상세에서 내린다(visibility=private).
//
// 수집 필터를 고쳐도 이미 등록된 항목은 그대로 남는다. 관리자 화면의 승인/보류는 `review` 상태
// 후보만 다루므로, 이미 public 이 된 항목을 되돌릴 수단이 없었다. 실제 사례: 제품 홈이 아니라
// 기사·스레드·트윗이 canonical URL 이라 이름을 정할 근거가 없던 4건.
//
// 사용법: pnpm hide --slug=a,b        (지정한 slug 를 비공개로)
//        pnpm hide --slug=a --dry    (대상만 출력, 쓰기 없음)

const env = loadWorkspaceEnvironment();
const dryRun = process.argv.includes("--dry");
const slugs = process.argv
  .filter((arg) => arg.startsWith("--slug="))
  .flatMap((arg) => arg.slice("--slug=".length).split(","))
  .map((slug) => slug.trim())
  .filter(Boolean);

if (slugs.length === 0) {
  process.stderr.write("사용법: pnpm hide --slug=<slug>[,<slug>...] [--dry]\n");
  process.exit(1);
}

const url = env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!url || !key) {
  process.stderr.write("Supabase URL과 서버 비밀키가 필요합니다.\n");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const rows = z.array(z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  canonical_url: z.string(),
  visibility: z.string(),
})).parse(
  await readAllPages(async (from, to) => {
    const { data, error } = await supabase
      .from("entities")
      .select("id,slug,name,canonical_url,visibility")
      .order("id")
      .range(from, to);
    if (error) throw new Error(`엔티티 조회 실패: ${error.message}`);
    return data ?? [];
  }),
);

const targets = rows.filter((row) => slugs.includes(row.slug));
const missing = slugs.filter((slug) => !rows.some((row) => row.slug === slug));
if (missing.length > 0) process.stderr.write(`찾지 못한 slug: ${missing.join(", ")}\n`);

const hidden: { slug: string; name: string; from: string }[] = [];
for (const target of targets) {
  if (target.visibility === "private") continue;
  hidden.push({ slug: target.slug, name: target.name, from: target.visibility });
  if (!dryRun) {
    const { error } = await supabase
      .from("entities")
      // 관리자가 직접 내린 결정이라 자동 정리 표시를 지운다. 그래야 재수집돼도 되살아나지 않는다
      // (revivedVisibilityPatch 는 자동 정리분만 복구한다).
      .update({ visibility: "private", dismissed_as_stale_at: null, updated_at: new Date().toISOString() })
      .eq("id", target.id);
    if (error) process.stderr.write(`비공개 처리 실패 [${target.slug}]: ${error.message}\n`);
  }
}

process.stdout.write(`${JSON.stringify({
  requested: slugs.length,
  found: targets.length,
  hiddenCount: hidden.length,
  dryRun,
  hidden,
}, null, 2)}\n`);
