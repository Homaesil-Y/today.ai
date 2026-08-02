import type { TrendAnalysisResult } from "@ai-trend-radar/llm";
import type { SourceCode } from "@ai-trend-radar/types";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { slugifyName } from "./candidate";
import type { EntityCandidate } from "./schema";
import { databaseRawItemSchema } from "./schema";

/** 파이프라인이 실제로 후보를 추출하는 채널. 새 수집기를 붙이면 여기에 추가한다. */
export const INGESTED_SOURCES = ["github", "hacker_news", "product_hunt", "reddit"] as const;
export type IngestedSource = (typeof INGESTED_SOURCES)[number];

/**
 * 서로 다른 제품 수백 개가 같은 호스트를 공유하는 도메인. 이런 도메인은 "도메인이 같으면 같은 제품"
 * 규칙에서 제외해야 한다. 제외하지 않으면 해당 도메인의 모든 제품이 첫 엔티티 하나로 흡수된다
 * (실제로 Product Hunt 제품 131건이 "Lev8" 한 건으로 합쳐졌다. producthunt.com이 제품 홈페이지
 * 대신 producthunt.com/r/<code> 리다이렉트를 내려주기 때문).
 */
export const SHARED_HOST_DOMAINS = new Set([
  "github.com",
  "gitlab.com",
  "producthunt.com",
  "huggingface.co",
  "twitter.com",
  "x.com",
  "gumroad.com",
  "notion.so",
  "apps.apple.com",
  "play.google.com",
  "chromewebstore.google.com",
  "marketplace.visualstudio.com",
  "npmjs.com",
]);

/** 이미 기록된 채널에 새 채널을 더한다. 중복 없이, 순서를 고정해 불필요한 쓰기를 막는다. */
export function mergeSourceCodes(existing: readonly string[], incoming: string) {
  return [...new Set([...existing, incoming])].sort();
}

const sourceSchema = z.object({ id: z.uuid(), code: z.string() });
const categorySchema = z.object({ id: z.uuid(), slug: z.string(), name: z.string() });
const entitySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  canonical_url: z.url(),
  official_domain: z.string().nullable(),
  github_url: z.string().nullable(),
  description: z.string().nullable(),
  category_id: z.string().nullable(),
  pricing_type: z.string(),
  is_open_source: z.boolean(),
  visibility: z.enum(["public", "private", "review"]),
  first_detected_at: z.iso.datetime({ offset: true }),
  last_detected_at: z.iso.datetime({ offset: true }),
  // 웹 화면이 실제 유입 채널을 표시할 수 있도록 저장 시점에 누적한다.
  // (entity_mentions·raw_items·sources는 anon 역할에 SELECT 권한이 없어 화면에서 조인할 수 없다.)
  source_codes: z.array(z.string()).default([]),
});

type EntityRow = z.infer<typeof entitySchema>;

export interface BootstrapScoreRecord {
  breakdown: {
    crossSource: number;
    velocity: number;
    productGrowth: number;
    threads: number;
    reddit: number;
    novelty: number;
    instagram: number;
    quality: number;
  };
  totalScore: number;
  status: "WATCH" | "NEW" | "RISING" | "SURGING" | "PEAK" | "STABLE" | "FALLING" | "REVIVAL";
  trustScore: number;
  scoringVersion: string;
}

export class PipelineRepositoryError extends Error {
  constructor(message: string, readonly operation: string) {
    super(message);
    this.name = "PipelineRepositoryError";
  }
}

export class SupabasePipelineRepository {
  private readonly client: SupabaseClient;
  private readonly sourceIds = new Map<SourceCode, string>();
  private readonly categoryIds = new Map<string, string>();
  private readonly categoryTaxonomy: { slug: string; label: string }[] = [];
  private readonly entitiesByCanonical = new Map<string, EntityRow>();
  private readonly entitiesByGithub = new Map<string, EntityRow>();
  private readonly entitiesByDomain = new Map<string, EntityRow>();
  private readonly entitiesBySlugBase = new Map<string, EntityRow>();
  private readonly usedSlugs = new Set<string>();

  constructor(client: SupabaseClient) {
    this.client = client;
  }

  static fromEnvironment(env: NodeJS.ProcessEnv = process.env) {
    const url = env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const secretKey = env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY ?? "";
    if (!url || !secretKey) {
      throw new PipelineRepositoryError("Supabase URL과 서버 비밀키가 필요합니다.", "configure");
    }
    return new SupabasePipelineRepository(createClient(url, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    }));
  }

  async initialize() {
    const [sourcesResult, categoriesResult, entitiesResult] = await Promise.all([
      this.client.from("sources").select("id,code"),
      this.client.from("categories").select("id,slug,name").eq("enabled", true).order("sort_order"),
      this.client.from("entities").select("id,name,slug,canonical_url,official_domain,github_url,description,category_id,pricing_type,is_open_source,visibility,first_detected_at,last_detected_at,source_codes"),
    ]);
    if (sourcesResult.error) throw new PipelineRepositoryError(sourcesResult.error.message, "load_sources");
    if (categoriesResult.error) throw new PipelineRepositoryError(categoriesResult.error.message, "load_categories");
    if (entitiesResult.error) throw new PipelineRepositoryError(entitiesResult.error.message, "load_entities");

    for (const source of z.array(sourceSchema).parse(sourcesResult.data ?? [])) {
      if (INGESTED_SOURCES.includes(source.code as IngestedSource)) {
        this.sourceIds.set(source.code as SourceCode, source.id);
      }
    }
    for (const category of z.array(categorySchema).parse(categoriesResult.data ?? [])) {
      this.categoryIds.set(category.slug, category.id);
      this.categoryTaxonomy.push({ slug: category.slug, label: category.name });
    }
    for (const entity of z.array(entitySchema).parse(entitiesResult.data ?? [])) this.indexEntity(entity);
  }

  async loadRawItems() {
    const output = [];
    for (const source of INGESTED_SOURCES) {
      const sourceId = this.sourceIds.get(source);
      if (!sourceId) throw new PipelineRepositoryError(`source seed가 없습니다: ${source}`, "load_raw_items");
      const { data, error } = await this.client
        .from("raw_items")
        .select("id,source_id,source_item_id,title,body,url,canonical_url,author_name,published_at,collected_at,raw_metrics_json,raw_payload_json")
        .eq("source_id", sourceId)
        .order("published_at", { ascending: false })
        .limit(1_000);
      if (error) throw new PipelineRepositoryError(error.message, "load_raw_items");
      for (const row of data ?? []) output.push(databaseRawItemSchema.parse({ ...row, source }));
    }
    return output;
  }

  async upsertCandidate(candidate: EntityCandidate) {
    const existing = this.findEntity(candidate);
    const categoryId = this.categoryIds.get(candidate.categorySlug) ?? this.categoryIds.get("other") ?? null;
    let entity: EntityRow;

    if (existing) {
      const firstDetectedAt = new Date(existing.first_detected_at) <= new Date(candidate.firstDetectedAt)
        ? existing.first_detected_at
        : candidate.firstDetectedAt;
      const { data, error } = await this.client.from("entities").update({
        last_detected_at: candidate.lastDetectedAt,
        first_detected_at: firstDetectedAt,
        github_url: existing.github_url ?? candidate.githubUrl,
        description: existing.description ?? candidate.description,
        category_id: existing.category_id ?? categoryId,
        pricing_type: existing.pricing_type === "unknown" ? candidate.pricingType : existing.pricing_type,
        is_open_source: existing.is_open_source || candidate.isOpenSource,
        // 같은 제품이 여러 채널로 들어오면 채널을 누적한다(교차 출처 표시의 근거).
        source_codes: mergeSourceCodes(existing.source_codes, candidate.source),
        updated_at: candidate.lastDetectedAt,
      }).eq("id", existing.id).select("id,name,slug,canonical_url,official_domain,github_url,description,category_id,pricing_type,is_open_source,visibility,first_detected_at,last_detected_at,source_codes").single();
      if (error) throw new PipelineRepositoryError(error.message, "update_entity");
      entity = entitySchema.parse(data);
    } else {
      const slug = this.uniqueSlug(candidate.slugBase, candidate.canonicalUrl);
      const { data, error } = await this.client.from("entities").insert({
        name: candidate.name,
        slug,
        canonical_url: candidate.canonicalUrl,
        official_domain: candidate.officialDomain,
        github_url: candidate.githubUrl,
        description: candidate.description,
        category_id: categoryId,
        pricing_type: candidate.pricingType,
        is_open_source: candidate.isOpenSource,
        first_detected_at: candidate.firstDetectedAt,
        last_detected_at: candidate.lastDetectedAt,
        source_codes: [candidate.source],
        status: "WATCH",
        visibility: "review",
      }).select("id,name,slug,canonical_url,official_domain,github_url,description,category_id,pricing_type,is_open_source,visibility,first_detected_at,last_detected_at,source_codes").single();
      if (error) throw new PipelineRepositoryError(error.message, "insert_entity");
      entity = entitySchema.parse(data);
    }
    this.indexEntity(entity);
    await this.saveAliasMentionAndMetric(entity.id, candidate);
    return entity;
  }

  async saveScore(entityId: string, score: BootstrapScoreRecord, scoreDate: string) {
    const { breakdown } = score;
    const { error } = await this.client.from("trend_scores").upsert({
      entity_id: entityId,
      score_date: scoreDate,
      total_score: score.totalScore,
      cross_source_score: breakdown.crossSource,
      velocity_score: breakdown.velocity,
      product_growth_score: breakdown.productGrowth,
      threads_score: breakdown.threads,
      reddit_score: breakdown.reddit,
      novelty_score: breakdown.novelty,
      instagram_score: breakdown.instagram,
      quality_score: breakdown.quality,
      trust_score: score.trustScore,
      status: score.status,
      scoring_version: score.scoringVersion,
      calculated_at: new Date().toISOString(),
    }, { onConflict: "entity_id,score_date,scoring_version" });
    if (error) throw new PipelineRepositoryError(error.message, "upsert_trend_score");

    const { error: entityError } = await this.client.from("entities")
      .update({ status: score.status, updated_at: new Date().toISOString() })
      .eq("id", entityId);
    if (entityError) throw new PipelineRepositoryError(entityError.message, "update_entity_status");
  }

  /**
   * 주어진 엔티티들에 대해 (model, promptVersion) 기준 가장 최근 분석 시각(epoch ms)을 한 번의 조회로 가져온다.
   * 분석 기록이 없는 엔티티는 Map 에 포함되지 않으므로 "미분석" 판별에 사용할 수 있다.
   */
  async loadLatestAnalysisAt(entityIds: string[], model: string, promptVersion: string) {
    const latest = new Map<string, number>();
    if (entityIds.length === 0) return latest;

    const { data, error } = await this.client.from("ai_analyses")
      .select("entity_id,generated_at")
      .in("entity_id", entityIds)
      .eq("model_name", model)
      .eq("prompt_version", promptVersion);
    if (error) throw new PipelineRepositoryError(error.message, "load_latest_analysis");

    for (const row of data ?? []) {
      if (typeof row.entity_id !== "string" || typeof row.generated_at !== "string") continue;
      const timestamp = new Date(row.generated_at).getTime();
      if (Number.isNaN(timestamp)) continue;
      const current = latest.get(row.entity_id);
      if (current === undefined || timestamp > current) latest.set(row.entity_id, timestamp);
    }
    return latest;
  }

  async saveAnalysis(entityId: string, result: TrendAnalysisResult) {
    const { analysis } = result;
    const { error } = await this.client.from("ai_analyses").insert({
      entity_id: entityId,
      summary: analysis.summary,
      why_trending_json: analysis.whyTrending,
      target_users_json: analysis.targetUsers,
      strengths_json: analysis.strengths,
      weaknesses_json: analysis.weaknesses,
      use_cases_json: analysis.useCases,
      benchmark_points_json: analysis.benchmarkPoints,
      korea_opportunity: analysis.koreaOpportunity,
      business_potential: analysis.businessPotential,
      development_difficulty: analysis.developmentDifficulty,
      model_provider: result.provider,
      model_name: result.model,
      prompt_version: result.promptVersion,
      generated_at: result.generatedAt,
    });
    if (error) throw new PipelineRepositoryError(error.message, "insert_analysis");
  }

  // 분류기에 넘길 현재 활성 카테고리 목록(slug+라벨). DB 기반이라 승인된 신규 카테고리도 포함된다.
  getCategoryTaxonomy(): { slug: string; label: string }[] {
    return this.categoryTaxonomy;
  }

  // LLM 분류 결과(slug)를 엔티티 category_id에 반영한다. 알 수 없는 slug는 무시(false 반환).
  async assignCategoryBySlug(entityId: string, slug: string): Promise<boolean> {
    const categoryId = this.categoryIds.get(slug);
    if (!categoryId) return false;
    const { error } = await this.client
      .from("entities")
      .update({ category_id: categoryId, updated_at: new Date().toISOString() })
      .eq("id", entityId);
    if (error) throw new PipelineRepositoryError(error.message, "assign_category");
    return true;
  }

  async autoApproveAnalyzedCandidates() {
    const { data: analysisRows, error: analysisError } = await this.client
      .from("ai_analyses")
      .select("entity_id");
    if (analysisError) throw new PipelineRepositoryError(analysisError.message, "load_analyzed_candidates");

    const entityIds = [...new Set((analysisRows ?? []).map((row) => row.entity_id).filter((id): id is string => typeof id === "string"))];
    if (entityIds.length === 0) return 0;

    const { data, error } = await this.client
      .from("entities")
      .update({ visibility: "public", updated_at: new Date().toISOString() })
      .in("id", entityIds)
      .eq("visibility", "review")
      .select("id");
    if (error) throw new PipelineRepositoryError(error.message, "auto_approve_analyzed_candidates");
    return data?.length ?? 0;
  }

  private findEntity(candidate: EntityCandidate) {
    const canonical = this.entitiesByCanonical.get(candidate.canonicalUrl);
    if (canonical) return canonical;
    if (candidate.githubUrl) {
      const github = this.entitiesByGithub.get(candidate.githubUrl);
      if (github) return github;
    }
    if (!SHARED_HOST_DOMAINS.has(candidate.officialDomain)) {
      const domain = this.entitiesByDomain.get(candidate.officialDomain);
      if (domain) return domain;
    }
    // 공식 링크(랜딩페이지)와 GitHub 저장소처럼 서로 다른 채널로 같은 제품이 들어오면
    // URL/도메인이 전혀 겹치지 않는다. 이름이 완전히 같으면 같은 제품으로 보고 병합한다
    // (그렇지 않으면 슬러그 충돌로 "-<base64>" 접미사가 붙은 중복 엔티티가 생긴다).
    return this.entitiesBySlugBase.get(candidate.slugBase);
  }

  private indexEntity(entity: EntityRow) {
    this.entitiesByCanonical.set(entity.canonical_url, entity);
    if (entity.github_url) this.entitiesByGithub.set(entity.github_url, entity);
    if (entity.official_domain && !SHARED_HOST_DOMAINS.has(entity.official_domain)) this.entitiesByDomain.set(entity.official_domain, entity);
    this.entitiesBySlugBase.set(slugifyName(entity.name, entity.canonical_url), entity);
    this.usedSlugs.add(entity.slug);
  }

  private uniqueSlug(base: string, canonicalUrl: string) {
    if (!this.usedSlugs.has(base)) return base;
    const suffix = Buffer.from(canonicalUrl).toString("base64url").slice(0, 8).toLowerCase();
    return `${base.slice(0, 54)}-${suffix}`;
  }

  private async saveAliasMentionAndMetric(entityId: string, candidate: EntityCandidate) {
    const sourceId = this.sourceIds.get(candidate.source);
    if (!sourceId) throw new PipelineRepositoryError(`source seed가 없습니다: ${candidate.source}`, "persist_candidate");
    const metric = candidate.metrics;
    const [aliasResult, mentionResult, metricResult] = await Promise.all([
      this.client.from("entity_aliases").upsert({
        entity_id: entityId,
        alias: candidate.alias,
        alias_type: candidate.source === "github" ? "github_full_name" : "source_title",
        source_id: sourceId,
      }, { onConflict: "entity_id,alias" }),
      this.client.from("entity_mentions").upsert({
        entity_id: entityId,
        raw_item_id: candidate.rawItem.id,
        match_method: candidate.matchMethod,
        confidence: candidate.confidence,
      }, { onConflict: "entity_id,raw_item_id" }),
      this.client.from("metric_snapshots").upsert({
        entity_id: entityId,
        source_id: sourceId,
        stars: metric.stars ?? null,
        forks: metric.forks ?? null,
        score: metric.points ?? null,
        comments: metric.comments ?? null,
        measured_at: candidate.rawItem.collected_at,
        raw_metrics_json: metric,
      }, { onConflict: "entity_id,source_id,measured_at" }),
    ]);
    if (aliasResult.error) throw new PipelineRepositoryError(aliasResult.error.message, "upsert_alias");
    if (mentionResult.error) throw new PipelineRepositoryError(mentionResult.error.message, "upsert_mention");
    if (metricResult.error) throw new PipelineRepositoryError(metricResult.error.message, "upsert_metric");
  }
}
