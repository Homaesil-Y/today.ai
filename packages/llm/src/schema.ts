import { SOURCE_CODES } from "@ai-trend-radar/types";
import { z } from "zod";

const shortText = z.string().trim().min(2).max(240);
const textList = z.array(shortText).min(1).max(6);

export const trendEvidenceSchema = z.object({
  name: z.string().trim().min(1).max(120),
  category: z.string().trim().min(1).max(80),
  canonicalUrl: z.url(),
  observedAt: z.iso.datetime(),
  officialFacts: z.array(shortText).max(20),
  sources: z.array(z.object({
    source: z.enum(SOURCE_CODES),
    url: z.url(),
    title: z.string().trim().min(1).max(300),
    excerpt: z.string().trim().min(1).max(2_000),
    metrics: z.record(z.string(), z.number()).optional(),
  })).min(1).max(30),
});

export const trendAnalysisSchema = z.object({
  summary: z.string().trim().min(10).max(300),
  whyTrending: textList,
  targetUsers: textList,
  strengths: textList,
  weaknesses: textList,
  pricingType: z.enum(["free", "freemium", "paid", "open_source", "unknown"]),
  useCases: textList,
  benchmarkPoints: textList,
  koreaOpportunity: z.string().trim().min(5).max(500),
  businessPotential: z.enum(["HIGH", "MEDIUM", "LOW"]),
  developmentDifficulty: z.enum(["HIGH", "MEDIUM", "LOW"]),
});

export type TrendEvidence = z.infer<typeof trendEvidenceSchema>;
export type TrendAnalysis = z.infer<typeof trendAnalysisSchema>;

export const trendAnalysisJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string", description: "근거에 기반한 한국어 한 문장 요약" },
    whyTrending: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 6 },
    targetUsers: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 6 },
    strengths: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 6 },
    weaknesses: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 6 },
    pricingType: { type: "string", enum: ["free", "freemium", "paid", "open_source", "unknown"] },
    useCases: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 6 },
    benchmarkPoints: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 6 },
    koreaOpportunity: { type: "string" },
    businessPotential: { type: "string", enum: ["HIGH", "MEDIUM", "LOW"] },
    developmentDifficulty: { type: "string", enum: ["HIGH", "MEDIUM", "LOW"] },
  },
  required: [
    "summary",
    "whyTrending",
    "targetUsers",
    "strengths",
    "weaknesses",
    "pricingType",
    "useCases",
    "benchmarkPoints",
    "koreaOpportunity",
    "businessPotential",
    "developmentDifficulty",
  ],
} as const;
