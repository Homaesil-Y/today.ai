import type { MetadataRoute } from "next";
import { getPublishedTrends } from "@/data/live-trends";
import { getPublishedReports } from "@/data/reports";
import { siteConfig } from "@/lib/site";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteConfig.url;
  const [trends, reports] = await Promise.all([getPublishedTrends(), getPublishedReports()]);
  const latest = trends[0]?.updatedAt ? new Date(trends[0].updatedAt) : new Date();
  return [
    { url: base, lastModified: latest, changeFrequency: "daily", priority: 1 },
    { url: `${base}/explore`, lastModified: latest, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/categories`, lastModified: latest, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/compare`, lastModified: latest, changeFrequency: "weekly", priority: 0.6 },
    { url: `${base}/news`, lastModified: latest, changeFrequency: "hourly", priority: 0.8 },
    { url: `${base}/methodology`, lastModified: new Date("2026-07-22"), changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/privacy`, lastModified: new Date("2026-07-22"), changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/terms`, lastModified: new Date("2026-07-22"), changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/reports`, lastModified: latest, changeFrequency: "daily", priority: 0.7 },
    ...reports.map((report) => ({ url: `${base}/reports/${report.reportDate}`, lastModified: report.publishedAt ? new Date(report.publishedAt) : latest, changeFrequency: "monthly" as const, priority: 0.5 })),
    ...trends.map((trend) => ({ url: `${base}/services/${trend.slug}`, lastModified: new Date(trend.updatedAt), changeFrequency: "daily" as const, priority: 0.8 })),
  ];
}
