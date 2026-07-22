import type { MetadataRoute } from "next";
import { getPublishedTrends } from "@/data/live-trends";
import { siteConfig } from "@/lib/site";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteConfig.url;
  const trends = await getPublishedTrends();
  const latest = trends[0]?.updatedAt ? new Date(trends[0].updatedAt) : new Date();
  return [
    { url: base, lastModified: latest, changeFrequency: "daily", priority: 1 },
    { url: `${base}/explore`, lastModified: latest, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/categories`, lastModified: latest, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/methodology`, lastModified: new Date("2026-07-22"), changeFrequency: "monthly", priority: 0.6 },
    ...trends.map((trend) => ({ url: `${base}/services/${trend.slug}`, lastModified: new Date(trend.updatedAt), changeFrequency: "daily" as const, priority: 0.8 })),
  ];
}
