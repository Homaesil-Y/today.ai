import { cache } from "react";
import { z } from "zod";
import { createPublicClient } from "@/lib/supabase/server";

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

const reportRowSchema = z.object({
  report_type: z.string(),
  report_date: z.string(),
  title: z.string(),
  summary: z.string().nullable(),
  content_json: z.unknown(),
  published_at: z.string().nullable(),
});

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

export const getPublishedReports = cache(async (): Promise<ReportSummary[]> => {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("reports")
    .select("report_type, report_date, title, summary, content_json, published_at")
    .eq("status", "published")
    .order("report_date", { ascending: false })
    .limit(60);
  if (error) return [];
  return z.array(reportRowSchema).parse(data ?? []).map((row) => ({
    reportType: row.report_type,
    reportDate: row.report_date,
    title: row.title,
    summary: row.summary,
    publishedAt: row.published_at,
  }));
});

export const getDailyReport = cache(async (reportDate: string): Promise<DailyReport | null> => {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("reports")
    .select("report_type, report_date, title, summary, content_json, published_at")
    .eq("status", "published")
    .eq("report_type", "daily")
    .eq("report_date", reportDate)
    .maybeSingle();
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
});
