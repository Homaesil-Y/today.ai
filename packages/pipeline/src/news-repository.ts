import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

export class NewsRepositoryError extends Error {
  constructor(message: string, readonly operation: string) {
    super(message);
    this.name = "NewsRepositoryError";
  }
}

const existingRowSchema = z.object({ canonical_url: z.string() });

export interface NewsInsertRow {
  source: string;
  url: string;
  canonicalUrl: string;
  originalTitle: string;
  koTitle: string;
  koSummary: string;
  publishedAt: string;
}

export class NewsRepository {
  constructor(private readonly client: SupabaseClient) {}

  static fromEnvironment(env: NodeJS.ProcessEnv = process.env) {
    const url = env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const secretKey = env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY ?? "";
    if (!url || !secretKey) {
      throw new NewsRepositoryError("NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SECRET_KEY가 필요합니다.", "configure");
    }
    return new NewsRepository(createClient(url, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    }));
  }

  async loadExistingCanonicalUrls(urls: string[]): Promise<Set<string>> {
    if (urls.length === 0) return new Set();
    const { data, error } = await this.client
      .from("news_items")
      .select("canonical_url")
      .in("canonical_url", urls);
    if (error) throw new NewsRepositoryError(error.message, "load_existing");
    return new Set(z.array(existingRowSchema).parse(data ?? []).map((row) => row.canonical_url));
  }

  async insertNews(rows: NewsInsertRow[]): Promise<number> {
    if (rows.length === 0) return 0;
    const now = new Date().toISOString();
    const payload = rows.map((row) => ({
      source: row.source,
      url: row.url,
      canonical_url: row.canonicalUrl,
      original_title: row.originalTitle,
      ko_title: row.koTitle,
      ko_summary: row.koSummary,
      published_at: row.publishedAt,
      updated_at: now,
    }));
    const { error } = await this.client.from("news_items").upsert(payload, { onConflict: "canonical_url" });
    if (error) throw new NewsRepositoryError(error.message, "insert");
    return rows.length;
  }
}
