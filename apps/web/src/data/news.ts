import { unstable_cache } from "next/cache";
import { cache } from "react";
import { z } from "zod";
import { createPublicClient } from "@/lib/supabase/server";

const NEWS_REVALIDATE_SECONDS = 300;

const rowSchema = z.object({
  id: z.string(),
  source: z.string(),
  url: z.string(),
  ko_title: z.string(),
  ko_summary: z.string(),
  published_at: z.string(),
});

export type NewsItem = {
  id: string;
  source: string;
  url: string;
  title: string;
  summary: string;
  publishedAt: string;
};

function mapRow(row: z.infer<typeof rowSchema>): NewsItem {
  return {
    id: row.id,
    source: row.source,
    url: row.url,
    title: row.ko_title,
    summary: row.ko_summary,
    publishedAt: row.published_at,
  };
}

// PostgREST or-필터/ilike를 깨뜨리는 문자를 제거한다.
function sanitizeQuery(value: string): string {
  return value.replace(/[,()%*]/gu, " ").replace(/\s+/gu, " ").trim().slice(0, 80);
}

// 통합 검색(제목·내용·출처)과 페이지네이션을 적용해 뉴스 한 페이지와 전체 건수를 반환한다.
export const getNewsPage = cache(unstable_cache(async (params: { q: string; page: number; pageSize: number }): Promise<{ items: NewsItem[]; total: number }> => {
  const { page, pageSize } = params;
  const q = sanitizeQuery(params.q);
  try {
    const supabase = createPublicClient();
    let query = supabase
      .from("news_items")
      .select("id, source, url, ko_title, ko_summary, published_at", { count: "exact" })
      .eq("is_published", true);
    if (q) {
      query = query.or(`ko_title.ilike.%${q}%,ko_summary.ilike.%${q}%,source.ilike.%${q}%`);
    }
    const from = Math.max(0, (page - 1) * pageSize);
    const { data, error, count } = await query
      .order("published_at", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) return { items: [], total: 0 };
    return { items: z.array(rowSchema).parse(data ?? []).map(mapRow), total: count ?? 0 };
  } catch {
    return { items: [], total: 0 };
  }
}, ["news-page"], { revalidate: NEWS_REVALIDATE_SECONDS, tags: ["news"] }));

// 공개된 뉴스를 최신순으로 읽는다. 테이블 미생성/오류 시 빈 배열을 반환해 페이지가 빈 상태를 보여주게 한다.
export const getLatestNews = cache(async (limit = 40): Promise<NewsItem[]> => {
  try {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("news_items")
      .select("id, source, url, ko_title, ko_summary, published_at")
      .eq("is_published", true)
      .order("published_at", { ascending: false })
      .limit(limit);
    if (error) return [];
    return z.array(rowSchema).parse(data ?? []).map((row) => ({
      id: row.id,
      source: row.source,
      url: row.url,
      title: row.ko_title,
      summary: row.ko_summary,
      publishedAt: row.published_at,
    }));
  } catch {
    return [];
  }
});
