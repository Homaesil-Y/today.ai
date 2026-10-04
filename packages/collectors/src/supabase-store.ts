import type { CollectorResult, RawItem, SourceCode } from "@ai-trend-radar/types";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { withRetry } from "./retry";

const sourceRowSchema = z.object({ id: z.uuid() });
const existingRawItemSchema = z.object({ source_item_id: z.string() });

export interface CollectorPersistenceSummary {
  source: SourceCode;
  fetchedCount: number;
  insertedCount: number;
  updatedCount: number;
  status: "succeeded" | "partial";
}

export interface SupabaseCollectorStoreConfig {
  url: string;
  secretKey: string;
  client?: SupabaseClient;
}

export class CollectorStorageError extends Error {
  /** status: Supabase 응답의 HTTP 상태코드. 응답이 없었으면 undefined. 재시도 판정이 우선 본다. */
  constructor(message: string, readonly operation: string, readonly status?: number) {
    super(message);
    this.name = "CollectorStorageError";
  }
}

export function toRawItemRows(sourceId: string, items: RawItem[]) {
  // 한 배치 안에서 sourceItemId 가 중복되면 제거한다. Postgres 는 upsert 한 번에 같은 conflict
  // 키(source_id,source_item_id)를 두 번 건드리면 "ON CONFLICT DO UPDATE command cannot affect
  // row a second time" 로 배치 전체를 거부한다 — 실제로 Product Hunt 가 같은 node.id 를 한 응답에
  // 두 번 실어 보내(페이지 경계 중복·다중 토픽 노출) 수집 워크플로가 반복 실패했다. 뒤에 온 항목이
  // 더 최신 지표라 마지막 것을 남긴다.
  const deduped = new Map<string, RawItem>();
  for (const item of items) deduped.set(item.sourceItemId, item);

  return [...deduped.values()].map((item) => ({
    source_id: sourceId,
    source_item_id: item.sourceItemId,
    title: item.title,
    body: item.body,
    url: item.url,
    canonical_url: item.canonicalUrl,
    author_name: item.authorName,
    published_at: item.publishedAt,
    raw_metrics_json: item.metrics,
    raw_payload_json: item.rawPayload,
    collected_at: item.collectedAt,
    updated_at: item.collectedAt,
  }));
}

/**
 * 다시 시도하면 결과가 달라질 수 있는 Supabase 실패인지 판단한다.
 *
 * pipeline 의 isRetryableSupabaseFailure 와 같은 규칙이다. 패키지 의존 방향(collectors →
 * pipeline)이 없어 여기서 한 번 더 정의한다 — 규칙을 바꾸면 양쪽을 함께 고친다.
 */
export function isRetryableStorageFailure(message: string): boolean {
  return /fetch failed|network|socket hang up|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EPIPE|EAI_AGAIN|UND_ERR|timeout|gateway|internal server error|service unavailable|too many connections|\b50\d\b/iu.test(message);
}

/**
 * 상태코드가 있으면 그것으로(5xx·408·429 재시도), 없으면 메시지로 판정한다.
 *
 * 메시지 문구 판정은 2026-10-04 에 "Internal server error."(500)를 놓쳤다 — 문구에 상태 숫자가 없었다.
 * pipeline 의 shouldRetrySupabaseError 와 같은 규칙이다(패키지 의존 방향 때문에 따로 둔다).
 */
export function shouldRetryStorageError(error: unknown): boolean {
  if (!(error instanceof CollectorStorageError)) return false;
  const { status } = error;
  if (status !== undefined && status !== 0) return status >= 500 || status === 408 || status === 429;
  return isRetryableStorageFailure(error.message);
}

export class SupabaseCollectorStore {
  private readonly client: SupabaseClient;

  /**
   * Supabase 왕복 한 번을 일시적 실패에 대해 재시도한다.
   *
   * 2026-09-12·13 수집 실행 2건이 여기서 죽었다. GitHub·HN·PH 수집은 성공했는데 raw_items
   * 저장이 504 Gateway Timeout 을 받았고, 재시도가 없어 채널 하나가 통째로 실패 처리됐다.
   * 이 저장은 전부 onConflict upsert 이거나 id 지정 update 라 멱등이므로 재시도가 안전하다.
   */
  private async request<T>(
    operation: string,
    build: () => PromiseLike<{ data: T | null; error: { message: string } | null; status?: number }>,
  ): Promise<T | null> {
    return withRetry(async () => {
      const { data, error, status } = await build();
      if (error) throw new CollectorStorageError(error.message, operation, status);
      return data;
    }, {
      attempts: 3,
      baseDelayMs: 500,
      shouldRetry: shouldRetryStorageError,
    });
  }

  constructor(config: SupabaseCollectorStoreConfig) {
    if (!config.url.trim() || !config.secretKey.trim()) {
      throw new CollectorStorageError(
        "Supabase URL과 서버 비밀키가 필요합니다.",
        "configure",
      );
    }
    this.client = config.client ?? createClient(config.url, config.secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  static fromEnvironment(env: NodeJS.ProcessEnv = process.env) {
    const secretKey = env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY ?? "";
    return new SupabaseCollectorStore({
      url: env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      secretKey,
    });
  }

  async persistResult(result: CollectorResult): Promise<CollectorPersistenceSummary> {
    const sourceId = await this.getSourceId(result.source);
    const sourceItemIds = result.items.map((item) => item.sourceItemId);
    const existing = sourceItemIds.length > 0
      ? await this.getExistingSourceItemIds(sourceId, sourceItemIds)
      : new Set<string>();
    const rows = toRawItemRows(sourceId, result.items);

    if (rows.length > 0) {
      await this.request("upsert_raw_items", () => this.client
        .from("raw_items")
        .upsert(rows, { onConflict: "source_id,source_item_id" }));
    }

    const insertedCount = sourceItemIds.filter((id) => !existing.has(id)).length;
    const updatedCount = sourceItemIds.length - insertedCount;
    const status = result.warnings.length > 0 ? "partial" as const : "succeeded" as const;
    await this.request("insert_collector_run", () => this.client.from("collector_runs").insert({
      source_id: sourceId,
      started_at: result.startedAt,
      finished_at: result.finishedAt,
      status,
      fetched_count: result.items.length,
      inserted_count: insertedCount,
      updated_count: updatedCount,
      error_count: result.warnings.length,
      api_calls: 1,
      rate_limit_remaining: result.rateLimit?.remaining ?? null,
      error_log_json: result.warnings,
    }));

    await this.request("update_source", () => this.client
      .from("sources")
      .update({ last_collected_at: result.finishedAt, updated_at: result.finishedAt })
      .eq("id", sourceId));

    return {
      source: result.source,
      fetchedCount: result.items.length,
      insertedCount,
      updatedCount,
      status,
    };
  }

  async persistFailure(source: SourceCode, startedAt: string, error: unknown) {
    const sourceId = await this.getSourceId(source);
    const message = error instanceof Error ? error.message : "Unknown collector failure";
    const finishedAt = new Date().toISOString();
    const { error: insertError } = await this.client.from("collector_runs").insert({
      source_id: sourceId,
      started_at: startedAt,
      finished_at: finishedAt,
      status: "failed",
      error_count: 1,
      api_calls: 1,
      error_log_json: [{ message }],
    });
    if (insertError) throw new CollectorStorageError(insertError.message, "insert_failed_run");
  }

  private async getSourceId(source: SourceCode) {
    const data = await this.request("select_source", () => this.client
      .from("sources")
      .select("id")
      .eq("code", source)
      .single());
    return sourceRowSchema.parse(data).id;
  }

  private async getExistingSourceItemIds(sourceId: string, ids: string[]) {
    const data = await this.request("select_existing_raw_items", () => this.client
      .from("raw_items")
      .select("source_item_id")
      .eq("source_id", sourceId)
      .in("source_item_id", ids));
    const parsed = z.array(existingRawItemSchema).parse(data ?? []);
    return new Set(parsed.map((row) => row.source_item_id));
  }
}
