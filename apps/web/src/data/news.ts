import { cache } from "react";
import { z } from "zod";
import { createPublicClient } from "@/lib/supabase/server";

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
