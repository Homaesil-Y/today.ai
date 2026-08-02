import { loadWorkspaceEnvironment } from "@ai-trend-radar/collectors";
import { createNameExtractorFromEnv } from "@ai-trend-radar/llm";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { looksLikeDescription } from "../candidate";

// 공개 엔티티의 표시명을 LLM으로 정정한다. 커뮤니티 게시글 제목을 기계적으로 잘라 만든 이름은
// 제품명이 아니라 문장·설명인 경우가 많아(예: "What should the GUI for AI agents look like?" → "MarbleOS")
// 설명 본문·공식 URL·저장소명을 함께 보고 실제 제품명을 다시 뽑는다.
//
// 사용법: pnpm rename            (이름이 문장으로 보이는 것만 정정)
//        pnpm rename --dry      (변경 예정만 출력, 쓰기 없음)
//        pnpm rename --all      (공개 엔티티 전체를 재검토)

const env = loadWorkspaceEnvironment();
const dryRun = process.argv.includes("--dry");
const checkAll = process.argv.includes("--all");

const url = env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!url || !key) {
  process.stderr.write("Supabase URL과 서버 비밀키가 필요합니다.\n");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const entityRows = z.array(z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  canonical_url: z.string(),
  github_url: z.string().nullable(),
})).parse(
  (await supabase
    .from("entities")
    .select("id,name,slug,description,canonical_url,github_url")
    .eq("visibility", "public")).data ?? [],
);

const targets = checkAll ? entityRows : entityRows.filter((entity) => looksLikeDescription(entity.name));
if (targets.length === 0) {
  process.stdout.write(`${JSON.stringify({ total: entityRows.length, targets: 0, changed: 0, dryRun })}\n`);
  process.exit(0);
}

// 표시명 정정은 분석 파이프라인의 후속 보정이라 실패해도 실행 전체를 깨뜨리면 안 된다.
// 같은 워크플로에서 앞선 Gemini 분석이 무료 한도를 소진하면 여기서 429가 나는데, 그때는
// 경고만 남기고 정상 종료해 다음 실행이 이어받게 한다.
let results: { index: number; name: string }[];
try {
  const extractor = createNameExtractorFromEnv(env);
  results = await extractor.extract(
    targets.map((entity, index) => ({
      index,
      currentName: entity.name,
      // HN 본문은 매우 길 수 있어 앞부분만 보낸다(제품명은 대개 첫 문단에 등장).
      description: (entity.description ?? "").slice(0, 600),
      canonicalUrl: entity.canonical_url,
      githubUrl: entity.github_url,
    })),
  );
} catch (error) {
  const reason = error instanceof Error ? error.message : "알 수 없는 오류";
  process.stderr.write(`표시명 정정을 건너뜁니다(다음 실행에서 재시도): ${reason}\n`);
  process.stdout.write(`${JSON.stringify({ total: entityRows.length, targets: targets.length, changed: 0, skipped: reason, dryRun })}\n`);
  process.exit(0);
}
const nameByIndex = new Map(results.map((result) => [result.index, result.name]));

// 같은 글자인데 대소문자만 다른 제안은 표기 개선일 수도, 퇴행일 수도 있다.
// 대문자가 줄어드는 방향(Semglot → semglot, Typst-WASM → typst-wasm)은 저장소 경로를
// 그대로 베낀 결과라 반영하지 않고, 늘어나는 방향(Sphere Sdk → Sphere SDK)만 받는다.
function isCasingRegression(from: string, to: string) {
  if (from.toLowerCase() !== to.toLowerCase()) return false;
  const uppercase = (value: string) => value.replace(/[^A-Z]/gu, "").length;
  return uppercase(to) < uppercase(from);
}

const changes: { slug: string; from: string; to: string }[] = [];
for (let i = 0; i < targets.length; i += 1) {
  const entity = targets[i]!;
  const newName = nameByIndex.get(i);
  if (!newName || newName === entity.name) continue;
  // 모델이 이름 대신 또 문장을 돌려주면 반영하지 않는다.
  if (looksLikeDescription(newName)) continue;
  if (isCasingRegression(entity.name, newName)) continue;
  changes.push({ slug: entity.slug, from: entity.name, to: newName });
  if (!dryRun) {
    // slug는 그대로 둔다. 이미 공개된 URL과 검색엔진 색인이 걸려 있어 바꾸면 링크가 깨진다.
    const { error } = await supabase
      .from("entities")
      .update({ name: newName, updated_at: new Date().toISOString() })
      .eq("id", entity.id);
    if (error) process.stderr.write(`업데이트 실패 [${entity.name}]: ${error.message}\n`);
  }
}

process.stdout.write(`${JSON.stringify({ total: entityRows.length, targets: targets.length, changed: changes.length, dryRun, changes }, null, 2)}\n`);
