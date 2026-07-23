import { createHash } from "node:crypto";
import { canonicalizeUrl } from "@ai-trend-radar/scoring";
import { z } from "zod";
import type { DatabaseRawItem, EntityCandidate } from "./schema";

const githubPayloadSchema = z.object({
  full_name: z.string(),
  html_url: z.url(),
  description: z.string().nullable(),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
  stargazers_count: z.number().nonnegative(),
  forks_count: z.number().nonnegative(),
  open_issues_count: z.number().nonnegative(),
  language: z.string().nullable(),
  topics: z.array(z.string()).default([]),
  homepage: z.string().nullable(),
  license: z.object({ spdx_id: z.string().nullable() }).nullable(),
});

const productHuntPayloadSchema = z.object({
  name: z.string(),
  tagline: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  url: z.string(),
  votesCount: z.number().nonnegative(),
  commentsCount: z.number().nonnegative(),
  topics: z
    .object({ edges: z.array(z.object({ node: z.object({ name: z.string() }) })) })
    .nullable()
    .optional(),
});

const aiTerms = /\b(ai|artificial intelligence|agentic|agent|llm|gpt|machine learning|deep learning|generative|rag|embedding|vision model|language model|claude|gemini)\b/iu;
const nonProductTerms = /\b(awesome|course|certification|certified|practitioner|tutorial|roadmap|interview|papers?|resources?|learning notes?|study guide|cheatsheet|curated list|dataset|compendium|from scratch|solution template|taxonomy|skill cards?|benchmark|eccv|cvpr|neurips|lecture|syllabus)\b/iu;
const productIntentTerms = /\b(show hn|launch|introducing|built|tool|platform|app|studio|agent|assistant|automation|open[ -]?source)\b/iu;
const githubProductIntentTerms = /\b(agent|assistant|platform|tool|suite|scanner|hub|ide|alternative|automation|sdk|client|extension|orchestration|companion|studio|builder|workflow)\b/iu;
const editorialHosts = new Set([
  "medium.com",
  "thenewstack.io",
  "substack.com",
  "blogspot.com",
  "dev.to",
  "youtube.com",
  "youtu.be",
]);

function hostname(value: string) {
  return new URL(value).hostname.toLowerCase().replace(/^www\./u, "");
}

function safeCanonicalUrl(primary: string, fallback: string) {
  try {
    const parsed = new URL(primary);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return canonicalizeUrl(primary);
  } catch {
    // Fall through to the collector-validated URL.
  }
  return canonicalizeUrl(fallback);
}

export function slugifyName(name: string, canonicalUrl: string) {
  const base = name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 64);
  if (base) return base;
  return `ai-service-${createHash("sha256").update(canonicalUrl).digest("hex").slice(0, 10)}`;
}

function prettifyRepositoryName(fullName: string) {
  const repository = fullName.split("/").at(-1) ?? fullName;
  return repository
    .replace(/[-_]+/gu, " ")
    .replace(/\b\w/gu, (letter) => letter.toUpperCase())
    .trim();
}

function productNameFromHackerNewsTitle(title: string) {
  const withoutPrefix = title.replace(/^show hn:\s*/iu, "").trim();
  const [candidate] = withoutPrefix.split(/\s+[–—-]\s+|:\s+/u, 1);
  return (candidate ?? withoutPrefix).trim().slice(0, 120);
}

function productNameFromRedditTitle(title: string) {
  const withoutPrefix = title
    .replace(/^\s*(show(\s*hn)?|show reddit|introducing|launch(ing)?|i\s+(just\s+)?(built|made|created|launched|shipped))\s*[:\-–—]?\s*/iu, "")
    .trim();
  const [candidate] = withoutPrefix.split(/\s*[,–—:]\s+|\s+-\s+/u, 1);
  return (candidate ?? withoutPrefix).trim().slice(0, 120);
}

export function classifyCategory(text: string) {
  // no-code는 "code"를 포함하므로 coding보다 먼저 검사한다(기존엔 no-code가 coding으로 오분류됐음).
  if (/\b(no[ -]?code|low[ -]?code|website builder|app builder)\b/iu.test(text)) return "no-code";
  if (/\b(image|photo|canvas|avatar|diffusion)\b/iu.test(text)) return "image";
  if (/\b(video|film|animation)\b/iu.test(text)) return "video";
  if (/\b(audio|voice|music|speech|tts|podcast)\b/iu.test(text)) return "audio-music";
  if (/\b(rag|retrieval|embedding|document|pdf|knowledge base)\b/iu.test(text)) return "document-rag";
  if (/\b(code|coding|developer|github|mcp|cli|sdk|ide)\b/iu.test(text)) return "coding";
  if (/\b(data|analytics|sql|dashboard|dataset)\b/iu.test(text)) return "data";
  if (/\b(agent|agentic|assistant|automation)\b/iu.test(text)) return "ai-agents";
  // 이하 신규 범주: 위에서 걸리지 않아 예전엔 "기타"로 떨어지던 항목만 구제하므로 기존 분류를 바꾸지 않는다.
  if (/\b(design|figma|prototyp)\b/iu.test(text)) return "design";
  if (/\b(marketing|seo|advertis|campaign|ad copy)\b/iu.test(text)) return "marketing";
  if (/\b(education|learning|tutor|course|quiz)\b/iu.test(text)) return "education";
  if (/\b(api|inference|serving|gpu|endpoint|infrastructure|gateway|self[- ]?host)\b/iu.test(text)) return "infrastructure-api";
  if (/\b(productivity|calendar|meeting|scheduling|note[- ]?taking|email)\b/iu.test(text)) return "productivity";
  return "other";
}

function extractGitHubCandidate(item: DatabaseRawItem): EntityCandidate | null {
  const parsed = githubPayloadSchema.safeParse(item.raw_payload_json);
  if (!parsed.success) return null;
  const repository = parsed.data;
  const evidenceText = [repository.full_name, repository.description, ...repository.topics].filter(Boolean).join(" ");
  if (!aiTerms.test(evidenceText) || !githubProductIntentTerms.test(evidenceText) || nonProductTerms.test(evidenceText)) return null;

  const canonicalUrl = safeCanonicalUrl(repository.homepage ?? "", repository.html_url);
  const name = prettifyRepositoryName(repository.full_name);
  const officialFacts = [
    "공식 GitHub 저장소가 공개되어 있습니다.",
    `수집 시점 GitHub 스타 ${repository.stargazers_count.toLocaleString("en-US")}개, 포크 ${repository.forks_count.toLocaleString("en-US")}개입니다.`,
  ];
  if (repository.license?.spdx_id) officialFacts.push(`저장소 라이선스 표기는 ${repository.license.spdx_id}입니다.`);

  return {
    name,
    slugBase: slugifyName(name, canonicalUrl),
    canonicalUrl,
    officialDomain: hostname(canonicalUrl),
    githubUrl: canonicalizeUrl(repository.html_url),
    description: repository.description,
    categorySlug: classifyCategory(evidenceText),
    pricingType: "open_source",
    isOpenSource: true,
    firstDetectedAt: item.published_at,
    lastDetectedAt: item.collected_at,
    confidence: repository.stargazers_count >= 1_000 ? 0.92 : repository.stargazers_count >= 100 ? 0.84 : 0.74,
    matchMethod: "github_repository",
    alias: repository.full_name,
    rawItem: item,
    source: "github",
    metrics: item.raw_metrics_json,
    officialFacts,
  };
}

function extractHackerNewsCandidate(item: DatabaseRawItem): EntityCandidate | null {
  const canonicalUrl = safeCanonicalUrl(item.canonical_url, item.url);
  const domain = hostname(canonicalUrl);
  const evidenceText = `${item.title} ${item.body ?? ""}`;
  const path = new URL(canonicalUrl).pathname.toLowerCase();
  const isShowHn = /^show hn:/iu.test(item.title);
  const isGitHubRepository = domain === "github.com" && /^\/[^/]+\/[^/]+/u.test(path);
  if (domain === "news.ycombinator.com") return null;
  if (!isShowHn && !isGitHubRepository) return null;
  if (!aiTerms.test(evidenceText) || !productIntentTerms.test(evidenceText)) return null;
  if (editorialHosts.has(domain) || /\/(blog|news|article|posts?|p)\//u.test(path)) return null;

  const name = productNameFromHackerNewsTitle(item.title);
  if (name.length < 2 || name.length > 120) return null;
  return {
    name,
    slugBase: slugifyName(name, canonicalUrl),
    canonicalUrl,
    officialDomain: domain,
    githubUrl: domain === "github.com" ? canonicalUrl : null,
    description: item.body,
    categorySlug: classifyCategory(evidenceText),
    pricingType: domain === "github.com" ? "open_source" : "unknown",
    isOpenSource: domain === "github.com",
    firstDetectedAt: item.published_at,
    lastDetectedAt: item.collected_at,
    confidence: isShowHn ? 0.82 : 0.72,
    matchMethod: domain === "github.com" ? "github_repository" : "official_domain",
    alias: name,
    rawItem: item,
    source: "hacker_news",
    metrics: item.raw_metrics_json,
    officialFacts: [
      `Hacker News에서 ${item.raw_metrics_json.points ?? 0}점, 댓글 ${item.raw_metrics_json.comments ?? 0}개로 수집되었습니다.`,
    ],
  };
}

function extractProductHuntCandidate(item: DatabaseRawItem): EntityCandidate | null {
  const parsed = productHuntPayloadSchema.safeParse(item.raw_payload_json);
  if (!parsed.success) return null;
  const post = parsed.data;

  const topicNames = (post.topics?.edges ?? []).map((edge) => edge.node.name);
  const evidenceText = [post.name, post.tagline, post.description, ...topicNames].filter(Boolean).join(" ");
  // Product Hunt 게시물은 이미 출시된 제품이므로 제품 의도는 전제하되, AI 관련성만 필터링한다.
  if (!aiTerms.test(evidenceText)) return null;

  const canonicalUrl = safeCanonicalUrl(item.canonical_url, item.url);
  const domain = hostname(canonicalUrl);
  if (editorialHosts.has(domain)) return null;

  const name = post.name.trim().slice(0, 120);
  if (name.length < 2) return null;

  const votes = post.votesCount;
  return {
    name,
    slugBase: slugifyName(name, canonicalUrl),
    canonicalUrl,
    officialDomain: domain,
    githubUrl: domain === "github.com" ? canonicalUrl : null,
    description: post.description?.trim() || post.tagline?.trim() || null,
    categorySlug: classifyCategory(evidenceText),
    pricingType: "unknown",
    isOpenSource: false,
    firstDetectedAt: item.published_at,
    lastDetectedAt: item.collected_at,
    confidence: votes >= 500 ? 0.9 : votes >= 150 ? 0.82 : 0.74,
    matchMethod: "official_domain",
    alias: name,
    rawItem: item,
    source: "product_hunt",
    metrics: item.raw_metrics_json,
    officialFacts: [
      `Product Hunt에 출시되어 추천 ${votes.toLocaleString("en-US")}표, 댓글 ${post.commentsCount.toLocaleString("en-US")}개를 받았습니다.`,
    ],
  };
}

function extractRedditCandidate(item: DatabaseRawItem): EntityCandidate | null {
  const canonicalUrl = safeCanonicalUrl(item.canonical_url, item.url);
  const domain = hostname(canonicalUrl);
  // 자체 토론 글(reddit permalink)·기사·에디토리얼은 제품 후보에서 제외한다.
  if (domain === "reddit.com" || domain === "redd.it" || domain === "news.ycombinator.com") return null;
  if (editorialHosts.has(domain)) return null;
  const path = new URL(canonicalUrl).pathname.toLowerCase();
  if (/\/(blog|news|article|posts?|p)\//u.test(path)) return null;

  const evidenceText = `${item.title} ${item.body ?? ""}`;
  if (!aiTerms.test(evidenceText) || !productIntentTerms.test(evidenceText)) return null;

  const isGitHubRepository = domain === "github.com" && /^\/[^/]+\/[^/]+/u.test(path);
  const name = productNameFromRedditTitle(item.title);
  if (name.length < 2 || name.length > 120) return null;

  const score = item.raw_metrics_json.score ?? 0;
  return {
    name,
    slugBase: slugifyName(name, canonicalUrl),
    canonicalUrl,
    officialDomain: domain,
    githubUrl: isGitHubRepository ? canonicalUrl : null,
    description: item.body,
    categorySlug: classifyCategory(evidenceText),
    pricingType: isGitHubRepository ? "open_source" : "unknown",
    isOpenSource: isGitHubRepository,
    firstDetectedAt: item.published_at,
    lastDetectedAt: item.collected_at,
    confidence: score >= 300 ? 0.8 : score >= 100 ? 0.74 : 0.68,
    matchMethod: isGitHubRepository ? "github_repository" : "official_domain",
    alias: name,
    rawItem: item,
    source: "reddit",
    metrics: item.raw_metrics_json,
    officialFacts: [
      `Reddit에서 추천 ${(item.raw_metrics_json.score ?? 0).toLocaleString("en-US")}점, 댓글 ${(item.raw_metrics_json.comments ?? 0).toLocaleString("en-US")}개로 수집되었습니다.`,
    ],
  };
}

export function extractEntityCandidate(item: DatabaseRawItem) {
  if (item.source === "github") return extractGitHubCandidate(item);
  if (item.source === "hacker_news") return extractHackerNewsCandidate(item);
  if (item.source === "product_hunt") return extractProductHuntCandidate(item);
  if (item.source === "reddit") return extractRedditCandidate(item);
  return null;
}
