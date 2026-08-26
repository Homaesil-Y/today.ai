import { withRetry } from "@ai-trend-radar/collectors";
import type { TrendAnalysisResult } from "@ai-trend-radar/llm";
import type { SourceCode, TrendScoreBreakdown } from "@ai-trend-radar/types";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { chunkRows, dedupeByKey } from "./batch-write";
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
  // 축 목록을 여기서 다시 적으면 축이 늘 때 두 곳을 고쳐야 한다(실제로 comments 축 추가에서
  // 이 사본이 어긋났다). 원본 한 곳만 유지한다.
  breakdown: TrendScoreBreakdown;
  totalScore: number;
  status: "WATCH" | "NEW" | "RISING" | "SURGING" | "PEAK" | "STABLE" | "FALLING" | "REVIVAL";
  trustScore: number;
  /** 순위 노출 대상 여부. false 면 검색·카테고리에는 남고 순위표에서만 빠진다. */
  ranked: boolean;
  scoringVersion: string;
}

export class PipelineRepositoryError extends Error {
  constructor(message: string, readonly operation: string) {
    super(message);
    this.name = "PipelineRepositoryError";
  }
}

/** Supabase 가 돌려주는 오류 객체. 네트워크 실패도 throw 대신 이 모양으로 온다. */
type SupabaseErrorLike = { message: string; details?: string | null; hint?: string | null; code?: string | null };

/**
 * 오류 메시지에 원인까지 담는다.
 *
 * 예전엔 `error.message` 만 던져서, fetch 실패가 전부 `TypeError: fetch failed` 한 줄로 올라왔다
 * — ECONNRESET 인지 DNS 실패인지 요청 헤드 초과인지 구분할 수 없어 원인을 짚을 수 없었다.
 * postgrest-js 는 `details` 에 `Caused by: ...` 와 원인 코드를 이미 채워 보내주므로 함께 남긴다.
 */
export function describeSupabaseError(error: SupabaseErrorLike): string {
  const parts = [error.message];
  if (error.code) parts.push(`code=${error.code}`);
  // details 는 스택까지 포함할 수 있어 첫 줄들만 남긴다(로그가 스택으로 덮이는 것을 막는다).
  const details = error.details?.split("\n").filter((line) => line.trim()).slice(0, 3).join(" / ");
  if (details) parts.push(details);
  return parts.join(" | ");
}

/**
 * 다시 시도하면 결과가 달라질 수 있는 실패인지 판단한다.
 *
 * postgrest-js 는 GET·HEAD·OPTIONS 만 재시도한다(RETRYABLE_METHODS). POST·PATCH 는 일반적으로
 * 비멱등이라 라이브러리가 손대지 않는데, 이 파이프라인의 쓰기는 전부 onConflict 를 지정한 upsert
 * 이거나 id 지정 update 라 실제로는 멱등이다. 그래서 여기서 직접 재시도한다.
 *
 * 2026-08-25 07:11Z 실행이 metric_snapshots upsert 한 건의 `fetch failed` 로 죽으면서, 남은
 * 후보의 점수 저장과 표시명 정정·리포트·검증 단계가 전부 건너뛰어졌다. 왕복 수천 회 중 한 번은
 * 실패할 수 있다고 보고 그 한 번이 실행 전체를 끝내지 않게 한다.
 */
export function isRetryableWriteFailure(message: string): boolean {
  return /fetch failed|network|socket hang up|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EPIPE|EAI_AGAIN|UND_ERR|timeout|too many connections|\b50[234]\b/iu.test(message);
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
  // 후보 루프에서 모아 두고 flushCandidateWrites() 에서 배치로 저장한다.
  private readonly pendingAliases: Array<{ entity_id: string; alias: string; alias_type: string; source_id: string }> = [];
  private readonly pendingMentions: Array<{ entity_id: string; raw_item_id: string; match_method: string; confidence: number }> = [];
  private readonly pendingMetrics: Array<Record<string, unknown>> = [];

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

  /**
   * 쓰기 한 건을 일시적 실패에 대해 재시도하며 실행한다.
   *
   * `build` 는 매 시도마다 쿼리를 새로 만들어야 한다 — Supabase 쿼리 빌더는 thenable 이라 한 번
   * await 하면 재사용할 수 없다.
   */
  private async write<T>(
    operation: string,
    build: () => PromiseLike<{ data: T | null; error: SupabaseErrorLike | null }>,
  ): Promise<T | null> {
    return withRetry(async () => {
      const { data, error } = await build();
      if (error) throw new PipelineRepositoryError(describeSupabaseError(error), operation);
      return data;
    }, {
      attempts: 3,
      baseDelayMs: 500,
      shouldRetry: (error) => error instanceof PipelineRepositoryError && isRetryableWriteFailure(error.message),
    });
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
   * 엔티티별 과거 점수 요약(직전 총점, 누적 스냅샷 수)을 가져온다.
   *
   * 상태 판정(RISING/FALLING/PEAK 등)은 직전 스냅샷과 비교해야 하는데, 예전엔 호출부가
   * previousScore/dataPoints 를 상수로 넘겨 모든 엔티티가 영구히 WATCH 였다. `scoreDate` 는
   * 이번 실행이 기록할 날짜라, 같은 날 재실행해도 직전 값이 자기 자신으로 덮이지 않게 제외한다.
   *
   * 같은 척도끼리만 비교한다. 예전엔 scoring_version 을 걸러내지 않아, 가중치를 바꾸는 순간 새
   * 척도 점수가 옛 척도 점수와 비교돼 전 엔티티가 한꺼번에 RISING/FALLING 으로 뒤집혔다. 버전이
   * 다른 이력은 없는 것으로 취급해 WATCH 로 두고, 하루가 지나면 자연히 같은 척도끼리 비교된다.
   */
  async loadScoreHistory(entityIds: string[], scoreDate: string, scoringVersion: string) {
    const summary = new Map<string, { previousScore: number; dataPoints: number }>();
    if (entityIds.length === 0) return summary;

    for (const chunk of chunkForFilter(entityIds)) {
      const rows = await readAllPages(async (from, to) => {
        const { data, error } = await this.client
          .from("trend_scores")
          .select("entity_id,total_score,score_date")
          .in("entity_id", chunk)
          .eq("scoring_version", scoringVersion)
          .lt("score_date", scoreDate)
          .order("score_date", { ascending: false })
          // 같은 날짜가 수백 행이라 정렬이 이것만으로는 전순서가 아니다. 페이지 경계에서 순서가
          // 흔들리면 행이 중복되거나 빠져 직전 점수를 잘못 고를 수 있으므로 고정 기준을 더한다.
          .order("entity_id", { ascending: true })
          .range(from, to);
        if (error) throw new PipelineRepositoryError(error.message, "load_score_history");
        return data ?? [];
      });

      for (const row of rows) {
        if (typeof row.entity_id !== "string" || typeof row.total_score !== "number") continue;
        const current = summary.get(row.entity_id);
        // 내림차순이라 처음 만나는 행이 직전 스냅샷이다.
        if (current) current.dataPoints += 1;
        else summary.set(row.entity_id, { previousScore: row.total_score, dataPoints: 1 });
      }
    }
    // dataPoints 는 이번에 기록할 스냅샷까지 포함해야 calculateStatus 의 "2건 이상" 조건과 맞는다.
    for (const value of summary.values()) value.dataPoints += 1;
    return summary;
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

  /**
   * 채널별 원본 항목을 끝까지 읽어온다.
   *
   * 예전엔 소스당 최신 1000건만 읽었다. 엔티티와 점수는 여기서 나온 항목에서만 만들어지므로,
   * 어떤 엔티티의 원본이 이 창을 벗어나면 그 엔티티는 조용히 점수 갱신과 재분석 대기열에서
   * 빠진다 — 공개 상태로 남은 채 점수·상태·스파크라인이 그 시점에 얼어붙는다. 게다가 개수
   * 기준 창이라 채널이 쌓일수록 커버하는 기간이 저절로 줄어, 언제 그 절벽이 오는지 알 수 없다
   * (실측 2026-08-12: hacker_news 930건으로 하루 ~32건 증가 — 이틀 뒤 도달 예정이었다).
   */
  async loadRawItems() {
    const output = [];
    for (const source of INGESTED_SOURCES) {
      const sourceId = this.sourceIds.get(source);
      if (!sourceId) throw new PipelineRepositoryError(`source seed가 없습니다: ${source}`, "load_raw_items");
      const rows = await readAllPages(async (from, to) => {
        const { data, error } = await this.client
          .from("raw_items")
          .select("id,source_id,source_item_id,title,body,url,canonical_url,author_name,published_at,collected_at,raw_metrics_json,raw_payload_json")
          .eq("source_id", sourceId)
          .order("published_at", { ascending: false })
          .range(from, to);
        if (error) throw new PipelineRepositoryError(error.message, "load_raw_items");
        return data ?? [];
      });
      for (const row of rows) output.push(databaseRawItemSchema.parse({ ...row, source }));
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
      const data = await this.write("update_entity", () => this.client.from("entities").update({
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
      }).eq("id", existing.id).select("id,name,slug,canonical_url,official_domain,github_url,description,category_id,pricing_type,is_open_source,visibility,first_detected_at,last_detected_at,source_codes,dismissed_as_stale_at").single());
      entity = entitySchema.parse(data);
    } else {
      const slug = this.uniqueSlug(candidate.slugBase, candidate.canonicalUrl);
      const data = await this.write("insert_entity", () => this.client.from("entities").insert({
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
      }).select("id,name,slug,canonical_url,official_domain,github_url,description,category_id,pricing_type,is_open_source,visibility,first_detected_at,last_detected_at,source_codes,dismissed_as_stale_at").single());
      entity = entitySchema.parse(data);
    }
    this.indexEntity(entity);
    this.bufferAliasMentionAndMetric(entity.id, candidate);
    return entity;
  }

  /**
   * 여러 엔티티의 점수를 배치로 저장한다.
   *
   * 예전엔 엔티티당 두 번 왕복했다(trend_scores upsert → entities.status update). 엔티티 781건이면
   * 1,562회다. 점수 행은 배치 upsert 로 묶고, 엔티티 상태는 상태값이 같은 것끼리 모아 한 번에
   * update 한다 — 상태는 8종류뿐이라 왕복이 최대 8회로 줄어든다.
   */
  async saveScores(records: ReadonlyArray<{ entityId: string; score: BootstrapScoreRecord }>, scoreDate: string) {
    if (records.length === 0) return { scores: 0, statusUpdates: 0 };
    const calculatedAt = new Date().toISOString();
    const rows = dedupeByKey(
      records.map(({ entityId, score }) => ({
        entity_id: entityId,
        score_date: scoreDate,
        total_score: score.totalScore,
        cross_source_score: score.breakdown.crossSource,
        velocity_score: score.breakdown.velocity,
        comments_score: score.breakdown.comments,
        product_growth_score: score.breakdown.productGrowth,
        threads_score: score.breakdown.threads,
        reddit_score: score.breakdown.reddit,
        novelty_score: score.breakdown.novelty,
        instagram_score: score.breakdown.instagram,
        quality_score: score.breakdown.quality,
        trust_score: score.trustScore,
        status: score.status,
        ranked: score.ranked,
        scoring_version: score.scoringVersion,
        calculated_at: calculatedAt,
      })),
      (row) => `${row.entity_id} ${row.score_date} ${row.scoring_version}`,
    );
    await this.upsertBatched("trend_scores", "upsert_trend_score", "entity_id,score_date,scoring_version", rows);

    // 상태별로 엔티티 id 를 모아 한 번씩만 update 한다.
    const idsByStatus = new Map<string, string[]>();
    for (const { entityId, score } of records) {
      const ids = idsByStatus.get(score.status);
      if (ids) ids.push(entityId);
      else idsByStatus.set(score.status, [entityId]);
    }
    let statusUpdates = 0;
    for (const [status, ids] of idsByStatus) {
      // id 목록은 쿼리스트링으로 나가므로 길이 기준으로 청크를 나눈다(query-chunks.ts 참고).
      for (const chunk of chunkForFilter([...new Set(ids)])) {
        await this.write("update_entity_status", () => this.client.from("entities")
          .update({ status, updated_at: calculatedAt })
          .in("id", chunk));
        statusUpdates += 1;
      }
    }
    return { scores: rows.length, statusUpdates };
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

  /**
   * 후보의 alias·mention·metric 을 버퍼에 담는다. 실제 저장은 flushCandidateWrites() 가 한다.
   *
   * 예전엔 후보마다 세 테이블에 바로 썼다(병렬 3건 = 순차 왕복 1회). 후보 828건이면 그 왕복만
   * 828회다. 이 세 테이블은 실행 중에 아무도 다시 읽지 않으므로(읽는 곳은 실행이 끝난 뒤의
   * verify CLI 와 관리자 화면뿐) 마지막에 한꺼번에 써도 결과가 같다.
   */
  private bufferAliasMentionAndMetric(entityId: string, candidate: EntityCandidate) {
    const sourceId = this.sourceIds.get(candidate.source);
    if (!sourceId) throw new PipelineRepositoryError(`source seed가 없습니다: ${candidate.source}`, "persist_candidate");
    const metric = candidate.metrics;
    this.pendingAliases.push({
      entity_id: entityId,
      alias: candidate.alias,
      alias_type: candidate.source === "github" ? "github_full_name" : "source_title",
      source_id: sourceId,
    });
    this.pendingMentions.push({
      entity_id: entityId,
      raw_item_id: candidate.rawItem.id,
      match_method: candidate.matchMethod,
      confidence: candidate.confidence,
    });
    this.pendingMetrics.push({
      entity_id: entityId,
      source_id: sourceId,
      stars: metric.stars ?? null,
      forks: metric.forks ?? null,
      score: metric.points ?? null,
      comments: metric.comments ?? null,
      measured_at: candidate.rawItem.collected_at,
      raw_metrics_json: metric,
    });
  }

  /**
   * 버퍼에 모인 alias·mention·metric 을 배치 upsert 한다.
   *
   * 후보 루프가 끝나면 반드시 호출해야 한다 — 호출하지 않으면 이번 실행의 mention·지표가 저장되지
   * 않는다. 분석 단계보다 앞에서 호출한다(분석은 마감 시각에 걸려 중간에 끝날 수 있다).
   */
  async flushCandidateWrites() {
    // 중복 제거는 선택이 아니다. Postgres 는 `ON CONFLICT DO UPDATE` 로 한 문장에서 같은 행을 두 번
    // 건드리면 문장 전체를 거부한다. 실측(2026-08-25, 후보 832건)으로 별칭 21건·지표 1건이 겹쳤다.
    const aliases = dedupeByKey(this.pendingAliases, (row) => `${row.entity_id}|${row.alias}`);
    const mentions = dedupeByKey(this.pendingMentions, (row) => `${row.entity_id}|${row.raw_item_id}`);
    const metrics = dedupeByKey(this.pendingMetrics, (row) => `${row.entity_id}|${row.source_id}|${row.measured_at}`);

    await this.upsertBatched("entity_aliases", "upsert_alias", "entity_id,alias", aliases);
    await this.upsertBatched("entity_mentions", "upsert_mention", "entity_id,raw_item_id", mentions);
    await this.upsertBatched("metric_snapshots", "upsert_metric", "entity_id,source_id,measured_at", metrics);

    this.pendingAliases.length = 0;
    this.pendingMentions.length = 0;
    this.pendingMetrics.length = 0;
    return { aliases: aliases.length, mentions: mentions.length, metrics: metrics.length };
  }

  /**
   * 이미 만들어진 점수 스냅샷 행을 그대로 저장한다(척도 변경 후 직전 날짜 백필용).
   *
   * saveScores 와 달리 entities.status 를 건드리지 않는다 — 과거 날짜를 채우는 작업이 현재
   * 상태를 덮으면 안 된다. 실패는 예외 대신 메시지로 돌려 호출부가 진행 상황을 출력하게 한다.
   */
  async upsertScoreSnapshots(rows: readonly Record<string, unknown>[]): Promise<{ error: string | null }> {
    try {
      await this.upsertBatched("trend_scores", "backfill_trend_score", "entity_id,score_date,scoring_version", rows);
      return { error: null };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }

  private async upsertBatched(table: string, operation: string, onConflict: string, rows: readonly unknown[]) {
    for (const chunk of chunkRows(rows)) {
      await this.write(operation, () => this.client.from(table).upsert(chunk, { onConflict }));
    }
  }
}
