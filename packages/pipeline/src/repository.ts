import type { TrendAnalysisResult } from "@ai-trend-radar/llm";
import type { SourceCode } from "@ai-trend-radar/types";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { slugifyName } from "./candidate";
import { chunkForFilter, readAllPages } from "./query-chunks";
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

/**
 * 재수집된 기존 엔티티의 visibility를 되돌릴지 결정한다.
 *
 * "오래된 후보 정리"로 자동 private된 후보만 review로 복구한다. private는 분석 대기열에서
 * 제외되고 관리자 화면의 승인/보류도 review 상태만 대상이라, 복구 경로가 없으면 한 번 정리된
 * 후보는 되살릴 방법이 아예 없다. 반대로 관리자가 직접 "보류"한 것(표시 없음)은 의도적 배제이므로
 * 손대지 않는다 — 계속 재수집되는 항목을 3시간마다 다시 보류해야 하는 상황을 막는다.
 * 공개(public)·검토 대기(review) 상태는 그대로 둔다.
 */
export function revivedVisibilityPatch(existing: { visibility: string; dismissed_as_stale_at: string | null }) {
  if (existing.visibility !== "private" || !existing.dismissed_as_stale_at) return {};
  return { visibility: "review" as const, dismissed_as_stale_at: null };
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
  // "오래된 후보 정리"로 자동 private된 시각(수동 보류는 null). 재수집 시 복구 여부를 가른다.
  dismissed_as_stale_at: z.string().nullable().default(null),
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
    // 엔티티는 페이지네이션으로 끝까지 읽는다. PostgREST는 기본 1000행까지만 돌려주므로,
    // 그냥 select() 하면 1000건을 넘는 순간 뒷부분이 조용히 잘린다 — findEntity 가 기존
    // 엔티티를 못 찾아 같은 제품이 중복 생성되기 시작한다(현재 466건, 하루 +20~26건 증가라
    // 몇 주 안에 도달할 수순이었다).
    const [sourcesResult, categoriesResult, entityRows] = await Promise.all([
      this.client.from("sources").select("id,code"),
      this.client.from("categories").select("id,slug,name").eq("enabled", true).order("sort_order"),
      readAllPages(async (from, to) => {
        const { data, error } = await this.client
          .from("entities")
          .select("id,name,slug,canonical_url,official_domain,github_url,description,category_id,pricing_type,is_open_source,visibility,first_detected_at,last_detected_at,source_codes,dismissed_as_stale_at")
          .order("id")
          .range(from, to);
        if (error) throw new PipelineRepositoryError(error.message, "load_entities");
        return data ?? [];
      }),
    ]);
    if (sourcesResult.error) throw new PipelineRepositoryError(sourcesResult.error.message, "load_sources");
    if (categoriesResult.error) throw new PipelineRepositoryError(categoriesResult.error.message, "load_categories");

    for (const source of z.array(sourceSchema).parse(sourcesResult.data ?? [])) {
      if (INGESTED_SOURCES.includes(source.code as IngestedSource)) {
        this.sourceIds.set(source.code as SourceCode, source.id);
      }
    }
    for (const category of z.array(categorySchema).parse(categoriesResult.data ?? [])) {
      this.categoryIds.set(category.slug, category.id);
      this.categoryTaxonomy.push({ slug: category.slug, label: category.name });
    }
    for (const entity of z.array(entitySchema).parse(entityRows)) this.indexEntity(entity);
  }

  /**
   * 후보를 기존 엔티티에 읽기 전용으로 매칭한다. upsertCandidate 와 같은 규칙(canonical URL →
   * GitHub URL → 도메인 → 이름)을 쓰되 아무것도 쓰지 않는다. 분석 전용 실행에서 쓴다 —
   * 매칭되지 않는 신규 후보는 수집 워크플로가 다음 주기에 생성하므로 여기서는 건너뛴다.
   */
  matchEntity(candidate: EntityCandidate) {
    return this.findEntity(candidate) ?? null;
  }

  /**
   * app_settings 테이블에서 관리자가 지정한 값을 읽는다. initialize() 없이도 호출할 수 있고,
   * 행이 없거나(마이그레이션 전) 조회에 실패해도 null만 반환한다 — 이 설정은 부가 기능이라
   * 읽기에 실패했다고 파이프라인 전체가 멈추면 안 된다. 호출부에서 기본값(Gemini)으로 대체한다.
   */
  async loadAppSetting(key: string): Promise<unknown> {
    const { data, error } = await this.client.from("app_settings").select("value").eq("key", key).maybeSingle();
    if (error || !data) return null;
    return data.value;
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
        // 자동 정리된 후보가 다시 수집되면 검토 대기로 복구한다(수동 보류는 유지).
        ...revivedVisibilityPatch(existing),
        updated_at: candidate.lastDetectedAt,
      }).eq("id", existing.id).select("id,name,slug,canonical_url,official_domain,github_url,description,category_id,pricing_type,is_open_source,visibility,first_detected_at,last_detected_at,source_codes,dismissed_as_stale_at").single();
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
      }).select("id,name,slug,canonical_url,official_domain,github_url,description,category_id,pricing_type,is_open_source,visibility,first_detected_at,last_detected_at,source_codes,dismissed_as_stale_at").single();
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
   * 주어진 엔티티들에 대해 promptVersion 기준 가장 최근 분석 시각(epoch ms)을 한 번의 조회로 가져온다.
   * 분석 기록이 없는 엔티티는 Map 에 포함되지 않으므로 "미분석" 판별에 사용할 수 있다.
   *
   * 모델명은 조건에서 제외한다. 예전엔 model_name까지 일치를 요구해서, 관리자가 프로바이더를
   * 바꾸면(Gemini→Groq) 기존 분석이 전부 이름이 안 맞아 "미분석"으로 재분류됐다. 실제로 전환
   * 직후 대기열이 74건에서 386건으로 뛰어, 공개가 필요한 검토 후보가 이미 분석이 끝난 공개
   * 서비스의 재분석과 경쟁했다. 프롬프트 버전이 같으면 어느 모델이 만든 분석이든 유효하다.
   *
   * 엔티티 목록은 청크로 나눠 보낸다. 한 요청에 전부 넣으면 URL 이 요청 헤드 한도를 넘어
   * fetch 가 실패한다(자세한 배경은 query-chunks.ts 참고).
   */
  async loadLatestAnalysisAt(entityIds: string[], promptVersion: string) {
    const latest = new Map<string, number>();
    if (entityIds.length === 0) return latest;

    for (const chunk of chunkForFilter(entityIds)) {
      const rows = await readAllPages(async (from, to) => {
        const { data, error } = await this.client.from("ai_analyses")
          .select("entity_id,generated_at")
          .in("entity_id", chunk)
          .eq("prompt_version", promptVersion)
          .range(from, to);
        if (error) throw new PipelineRepositoryError(error.message, "load_latest_analysis");
        return data ?? [];
      });

      for (const row of rows) {
        if (typeof row.entity_id !== "string" || typeof row.generated_at !== "string") continue;
        const timestamp = new Date(row.generated_at).getTime();
        if (Number.isNaN(timestamp)) continue;
        const current = latest.get(row.entity_id);
        if (current === undefined || timestamp > current) latest.set(row.entity_id, timestamp);
      }
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
    // review 후보만 조회한다(전체 ai_analyses가 아니라). ai_analyses는 계속 쌓여 PostgREST 기본
    // 응답 상한(1000행)을 이미 넘겼는데, 예전엔 그 테이블 전체를 무페이지네이션으로 읽어서
    // 1000번째 행 이후에 분석된 엔티티는 review 상태에서 조용히 빠져나오지 못했다(실측: review
    // 84건 중 16건이 이미 분석 완료 상태로 갇혀 있었다). review 후보 수는 분석 대기열 크기라
    // 훨씬 작고, 승인·48시간 정리로 계속 소진되므로 이 조회는 1000행 상한에 걸리지 않는다.
    const { data: reviewRows, error: reviewError } = await this.client
      .from("entities")
      .select("id")
      .eq("visibility", "review");
    if (reviewError) throw new PipelineRepositoryError(reviewError.message, "load_review_candidates");
    const reviewIds = (reviewRows ?? []).map((row) => row.id as string);
    if (reviewIds.length === 0) return 0;

    const analysisRows: Array<{ entity_id?: unknown }> = [];
    for (const chunk of chunkForFilter(reviewIds)) {
      analysisRows.push(...await readAllPages(async (from, to) => {
        const { data, error } = await this.client
          .from("ai_analyses")
          .select("entity_id")
          .in("entity_id", chunk)
          .range(from, to);
        if (error) throw new PipelineRepositoryError(error.message, "load_analyzed_candidates");
        return data ?? [];
      }));
    }

    const entityIds = [...new Set(analysisRows.map((row) => row.entity_id).filter((id): id is string => typeof id === "string"))];
    if (entityIds.length === 0) return 0;

    const approvedAt = new Date().toISOString();
    let approved = 0;
    for (const chunk of chunkForFilter(entityIds)) {
      const { data, error } = await this.client
        .from("entities")
        .update({ visibility: "public", updated_at: approvedAt })
        .in("id", chunk)
        .eq("visibility", "review")
        .select("id");
      if (error) throw new PipelineRepositoryError(error.message, "auto_approve_analyzed_candidates");
      approved += data?.length ?? 0;
    }
    return approved;
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
