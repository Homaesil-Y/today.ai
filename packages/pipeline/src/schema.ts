import { SOURCE_CODES, type PricingType, type SourceCode } from "@ai-trend-radar/types";
import { z } from "zod";

export const databaseRawItemSchema = z.object({
  id: z.uuid(),
  source_id: z.uuid(),
  source_item_id: z.string(),
  title: z.string(),
  body: z.string().nullable(),
  url: z.url(),
  canonical_url: z.url(),
  author_name: z.string().nullable(),
  published_at: z.iso.datetime({ offset: true }),
  collected_at: z.iso.datetime({ offset: true }),
  raw_metrics_json: z.record(z.string(), z.number()),
  raw_payload_json: z.unknown(),
  source: z.enum(SOURCE_CODES),
});

export type DatabaseRawItem = z.infer<typeof databaseRawItemSchema>;

export interface EntityCandidate {
  name: string;
  slugBase: string;
  canonicalUrl: string;
  officialDomain: string;
  githubUrl: string | null;
  description: string | null;
  categorySlug: string;
  pricingType: PricingType;
  isOpenSource: boolean;
  firstDetectedAt: string;
  lastDetectedAt: string;
  confidence: number;
  matchMethod: "github_repository" | "canonical_url" | "official_domain";
  alias: string;
  rawItem: DatabaseRawItem;
  source: SourceCode;
  metrics: Record<string, number>;
  officialFacts: string[];
}
