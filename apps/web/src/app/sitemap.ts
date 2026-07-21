import type { MetadataRoute } from "next";
import { getPublishedTrends } from "@/data/live-trends";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const trends = await getPublishedTrends();
  return [{ url: base, lastModified: new Date() }, { url: `${base}/explore`, lastModified: new Date() }, ...trends.map((trend) => ({ url: `${base}/services/${trend.slug}`, lastModified: new Date(trend.updatedAt) }))];
}
