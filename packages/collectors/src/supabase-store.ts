import type { CollectorResult, RawItem, SourceCode } from "@ai-trend-radar/types";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

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
  constructor(message: string, readonly operation: string) {
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

export class SupabaseCollectorStore {
  private readonly client: SupabaseClient;

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
      const { error } = await this.client
        .from("raw_items")
        .upsert(rows, { onConflict: "source_id,source_item_id" });
      if (error) throw new CollectorStorageError(error.message, "upsert_raw_items");
    }

    const insertedCount = sourceItemIds.filter((id) => !existing.has(id)).length;
    const updatedCount = sourceItemIds.length - insertedCount;
    const status = result.warnings.length > 0 ? "partial" as const : "succeeded" as const;
    const { error: runError } = await this.client.from("collector_runs").insert({
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
    });
    if (runError) throw new CollectorStorageError(runError.message, "insert_collector_run");

    const { error: sourceError } = await this.client
      .from("sources")
      .update({ last_collected_at: result.finishedAt, updated_at: result.finishedAt })
      .eq("id", sourceId);
    if (sourceError) throw new CollectorStorageError(sourceError.message, "update_source");

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
    const { data, error } = await this.client
      .from("sources")
      .select("id")
      .eq("code", source)
      .single();
    if (error) throw new CollectorStorageError(error.message, "select_source");
    return sourceRowSchema.parse(data).id;
  }

  private async getExistingSourceItemIds(sourceId: string, ids: string[]) {
    const { data, error } = await this.client
      .from("raw_items")
      .select("source_item_id")
      .eq("source_id", sourceId)
      .in("source_item_id", ids);
    if (error) throw new CollectorStorageError(error.message, "select_existing_raw_items");
    const parsed = z.array(existingRawItemSchema).parse(data ?? []);
    return new Set(parsed.map((row) => row.source_item_id));
  }
}
