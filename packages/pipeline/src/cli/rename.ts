import { loadWorkspaceEnvironment } from "@ai-trend-radar/collectors";
import { createNameExtractorFromEnv } from "@ai-trend-radar/llm";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { looksLikeDescription } from "../candidate";
import { readAllPages } from "../query-chunks";

// 공개 엔티티의 표시명을 LLM으로 정정한다. 커뮤니티 게시글 제목을 기계적으로 잘라 만든 이름은
// 제품명이 아니라 문장·설명인 경우가 많아(예: "What should the GUI for AI agents look like?" → "MarbleOS")
// 설명 본문·공식 URL·저장소명을 함께 보고 실제 제품명을 다시 뽑는다.
//
// 사용법: pnpm rename            (이름이 문장으로 보이는 것만 정정)
//        pnpm rename --dry      (변경 예정만 출력, 쓰기 없음)
//        pnpm rename --all      (공개 엔티티 전체를 재검토)
//        pnpm rename --slug=a,b (지정한 slug 만 재검토)

const env = loadWorkspaceEnvironment();
const dryRun = process.argv.includes("--dry");
const checkAll = process.argv.includes("--all");
const onlySlugs = process.argv
  .filter((arg) => arg.startsWith("--slug="))
  .flatMap((arg) => arg.slice("--slug=".length).split(","))
  .map((slug) => slug.trim())
  .filter(Boolean);

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
  // 공개 엔티티는 1000건을 넘으면 상한에서 조용히 잘려 뒷부분 표시명이 영구 미정정으로 남는다.
  await readAllPages(async (from, to) => {
    const { data, error } = await supabase
      .from("entities")
      .select("id,name,slug,description,canonical_url,github_url")
      .eq("visibility", "public")
      .order("id")
      .range(from, to);
    if (error) throw new Error(`공개 엔티티 조회 실패: ${error.message}`);
    return data ?? [];
  }),
);

// 특정 서비스만 다시 검토한다. 문장형이 아닌 잘못된 이름(예: 제품이 쓰는 도구명을 제품명으로
// 뽑은 "Claude Code")은 기본 필터에 걸리지 않아, 전체를 LLM에 다시 돌리지 않고 지목해서 고칠
// 수단이 필요하다.
const targets = onlySlugs.length > 0
  ? entityRows.filter((entity) => onlySlugs.includes(entity.slug))
  : checkAll ? entityRows : entityRows.filter((entity) => looksLikeDescription(entity.name));
if (onlySlugs.length > 0) {
  const missing = onlySlugs.filter((slug) => !entityRows.some((entity) => entity.slug === slug));
  if (missing.length > 0) process.stderr.write(`공개 엔티티에서 찾지 못한 slug: ${missing.join(", ")}\n`);
}
if (targets.length === 0) {
  process.stdout.write(`${JSON.stringify({ total: entityRows.length, targets: 0, changed: 0, dryRun })}\n`);
  process.exit(0);
}

/**
 * 제품 페이지가 스스로 밝히는 이름(og:site_name → <title>)을 가져온다.
 *
 * 게시글 텍스트만으로는 고칠 수 없는 경우가 있다. 게시글에 제품명이 없으면 근거가 없고,
 * 제품이 이름을 바꿔도 알 수 없다(실측: metavoice.io 는 스스로 "Familiar"라고 밝히는데 저장된
 * 이름은 게시글에서 뽑은 "Mia & Leo"였다). 실패는 조용히 무시한다 — 근거가 하나 없을 뿐이고,
 * Cloudflare 차단 페이지 같은 값을 이름으로 쓰지 않도록 판단은 모델에 맡긴다.
 */
async function fetchSiteName(target: string): Promise<string> {
  try {
    const res = await fetch(target, { redirect: "follow", signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return "";
    const html = (await res.text()).slice(0, 200_000);
    const og = (/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/iu.exec(html)?.[1] ?? "").trim();
    const title = (/<title[^>]*>([^<]*)<\/title>/iu.exec(html)?.[1] ?? "").trim();
    // 둘 다 넘긴다. og 만 쓰면 제목에 있는 이름을 놓쳐, 이미 맞는 이름을 사이트 운영자명으로
    // 바꾸는 제안이 통과한다("Shape of AI" 가 제목에 있는데 og 는 "Yupanqui"였다).
    return [og, title].filter(Boolean).join(" | ").slice(0, 200);
  } catch {
    return "";
  }
}

/** 대상 사이트를 동시에 너무 많이 두드리지 않도록 소량 병렬로만 가져온다. */
async function fetchSiteNames(urls: string[], concurrency = 4): Promise<string[]> {
  const out = new Array<string>(urls.length).fill("");
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, urls.length) }, async () => {
    while (next < urls.length) {
      const index = next++;
      out[index] = await fetchSiteName(urls[index] as string);
    }
  }));
  return out;
}

const siteNames = await fetchSiteNames(targets.map((entity) => entity.canonical_url));

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
      siteName: siteNames[index] ?? "",
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

/**
 * 제품 페이지 정보를 근거로 줄 때, 현재 이름이 그 페이지에 이미 등장하면 바꾸지 않는다.
 *
 * og:site_name 은 "사이트"의 이름이라 제품이 아닌 퍼블리셔·플랫폼일 수 있고, 하위 페이지
 * <title> 에는 제품군 접미사가 붙는다. 그대로 따르면 맞는 이름이 나빠진다 — 실측 제안 중
 * "Shape of AI"→"Yupanqui"(작품명을 사이트 운영자명으로 교체), "QuantSignals"→"QuantSignals FST"
 * (/fst 하위 페이지 접미사), "Afterimage"→og 가 "itch.io"(게시 플랫폼)가 그런 경우였다.
 *
 * 현재 이름이 페이지에 없을 때만 교체를 허용하면, 근거가 확실한 경우(metavoice.io 어디에도
 * "Mia & Leo"가 없고 "Familiar"라고 밝히는 경우)만 통과한다.
 */
function pageAlreadyShowsName(currentName: string, siteName: string) {
  const squash = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/gu, "");
  const key = squash(currentName);
  if (key.length < 3 || !siteName) return false;
  return squash(siteName).includes(key);
}

const changes: { slug: string; from: string; to: string }[] = [];
for (let i = 0; i < targets.length; i += 1) {
  const entity = targets[i]!;
  const newName = nameByIndex.get(i);
  if (!newName || newName === entity.name) continue;
  // 모델이 이름 대신 또 문장을 돌려주면 반영하지 않는다.
  if (looksLikeDescription(newName)) continue;
  if (isCasingRegression(entity.name, newName)) continue;
  if (pageAlreadyShowsName(entity.name, siteNames[i] ?? "")) continue;
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
