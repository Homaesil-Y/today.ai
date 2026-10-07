import { unstable_cache } from "next/cache";
import { cache } from "react";
import { z } from "zod";
import { cacheBucket } from "@/lib/cache-bucket";
import { withEgressMeter } from "@/lib/egress-meter";
import { createPublicClient } from "@/lib/supabase/server";

// 리포트는 하루 1회 발행이라 300초로 다시 읽을 이유가 없다.
const REPORTS_REVALIDATE_SECONDS = 1_800;

const topServiceSchema = z.object({
  rank: z.number(),
  slug: z.string(),
  name: z.string(),
  category: z.string().default("기타"),
  trendScore: z.coerce.number().default(0),
  trustScore: z.coerce.number().default(0),
  status: z.string().default("WATCH"),
  summary: z.string().nullable().default(null),
});

const contentSchema = z.object({
  generatedAt: z.string().optional(),
  timezone: z.string().optional(),
  totalPublic: z.number().default(0),
  topServices: z.array(topServiceSchema).default([]),
});

const reportListRowSchema = z.object({
  report_type: z.string(),
  report_date: z.string(),
  title: z.string(),
  summary: z.string().nullable(),
  published_at: z.string().nullable(),
});

const reportRowSchema = reportListRowSchema.extend({ content_json: z.unknown() });

export type ReportSummary = {
  reportType: string;
  reportDate: string;
  title: string;
  summary: string | null;
  publishedAt: string | null;
};

export type DailyReport = ReportSummary & {
  content: z.infer<typeof contentSchema>;
};

// `_bucket` 은 캐시 키를 주기적으로 회전시키는 인자다(lib/cache-bucket.ts 참고).
const loadPublishedReports = unstable_cache(async (_bucket: number): Promise<ReportSummary[]> => withEgressMeter("reports", async (fetchImpl) => {
  const supabase = createPublicClient({ fetch: fetchImpl });
  // 목록은 본문(content_json — 상위 10개 서비스와 요약)을 쓰지 않는다. 예전엔 60건치 본문을 함께 받아
  // 버렸다. 본문은 날짜별 상세(loadDailyReport)에서 1건만 읽는다.
  const { data, error } = await supabase
    .from("reports")
    .select("report_type, report_date, title, summary, published_at")
    .eq("status", "published")
    .order("report_date", { ascending: false })
    .limit(60);
  if (error) return [];
  return z.array(reportListRowSchema).parse(data ?? []).map((row) => ({
    reportType: row.report_type,
    reportDate: row.report_date,
    title: row.title,
    summary: row.summary,
    publishedAt: row.published_at,
  }));
}), ["published-reports"], { revalidate: REPORTS_REVALIDATE_SECONDS, tags: ["reports"] });

export const getPublishedReports = cache(
  (): Promise<ReportSummary[]> => loadPublishedReports(cacheBucket(REPORTS_REVALIDATE_SECONDS)),
);

const loadDailyReport = unstable_cache(async (reportDate: string, _bucket: number): Promise<DailyReport | null> => {
  const { data, error } = await withEgressMeter("reports", async (fetchImpl) => await createPublicClient({ fetch: fetchImpl })
    .from("reports")
    .select("report_type, report_date, title, summary, content_json, published_at")
    .eq("status", "published")
    .eq("report_type", "daily")
    .eq("report_date", reportDate)
    .maybeSingle());
  if (error || !data) return null;
  const row = reportRowSchema.parse(data);
  return {
    reportType: row.report_type,
    reportDate: row.report_date,
    title: row.title,
    summary: row.summary,
    publishedAt: row.published_at,
    content: contentSchema.catch({ totalPublic: 0, topServices: [] }).parse(row.content_json),
  };
}, ["daily-report"], { revalidate: REPORTS_REVALIDATE_SECONDS, tags: ["reports"] });

export const getDailyReport = cache(
  (reportDate: string): Promise<DailyReport | null> =>
    loadDailyReport(reportDate, cacheBucket(REPORTS_REVALIDATE_SECONDS)),
);
