import type { SourceCode, TrendEntity, TrendStatus } from "@ai-trend-radar/types";
import { cache } from "react";
import { z } from "zod";
import { createPublicClient } from "@/lib/supabase/server";

const entitySchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  canonical_url: z.string(),
  github_url: z.string().nullable(),
  description: z.string().nullable(),
  pricing_type: z.enum(["free", "freemium", "paid", "open_source", "unknown"]).catch("unknown"),
  is_open_source: z.boolean(),
  first_detected_at: z.string(),
  last_detected_at: z.string(),
  status: z.enum(["NEW", "RISING", "SURGING", "PEAK", "STABLE", "FALLING", "REVIVAL", "WATCH"]),
  categories: z.object({ name: z.string() }).nullable(),
});

const scoreSchema = z.object({
  entity_id: z.string(),
  total_score: z.coerce.number(),
  cross_source_score: z.coerce.number(),
  velocity_score: z.coerce.number(),
  product_growth_score: z.coerce.number(),
  threads_score: z.coerce.number(),
  reddit_score: z.coerce.number(),
  novelty_score: z.coerce.number(),
  instagram_score: z.coerce.number(),
  quality_score: z.coerce.number(),
  trust_score: z.coerce.number(),
  status: z.enum(["NEW", "RISING", "SURGING", "PEAK", "STABLE", "FALLING", "REVIVAL", "WATCH"]),
  calculated_at: z.string(),
});

const analysisSchema = z.object({
  entity_id: z.string(),
  summary: z.string(),
  why_trending_json: z.array(z.string()).catch([]),
  target_users_json: z.array(z.string()).catch([]),
  strengths_json: z.array(z.string()).catch([]),
  weaknesses_json: z.array(z.string()).catch([]),
  use_cases_json: z.array(z.string()).catch([]),
  benchmark_points_json: z.array(z.string()).catch([]),
  korea_opportunity: z.string().nullable(),
  generated_at: z.string(),
});

function inferSources(githubUrl: string | null): SourceCode[] {
  return githubUrl ? ["github"] : ["hacker_news"];
}

function latestByEntity<T extends { entity_id: string }>(rows: T[]) {
  const map = new Map<string, T>();
  for (const row of rows) if (!map.has(row.entity_id)) map.set(row.entity_id, row);
  return map;
}

export const getPublishedTrends = cache(async (): Promise<TrendEntity[]> => {
  const supabase = createPublicClient();
  const { data: entityData, error: entityError } = await supabase
    .from("entities")
    .select("id, slug, name, canonical_url, github_url, description, pricing_type, is_open_source, first_detected_at, last_detected_at, status, categories(name)")
    .eq("visibility", "public")
    .order("last_detected_at", { ascending: false });

  if (entityError) throw new Error(`공개 서비스 조회 실패: ${entityError.message}`);
  const entities = z.array(entitySchema).parse(entityData ?? []);
  if (entities.length === 0) return [];

  const ids = entities.map(({ id }) => id);
  const [{ data: scoreData, error: scoreError }, { data: analysisData, error: analysisError }] = await Promise.all([
    supabase.from("trend_scores").select("entity_id, total_score, cross_source_score, velocity_score, product_growth_score, threads_score, reddit_score, novelty_score, instagram_score, quality_score, trust_score, status, calculated_at").in("entity_id", ids).order("calculated_at", { ascending: false }),
    supabase.from("ai_analyses").select("entity_id, summary, why_trending_json, target_users_json, strengths_json, weaknesses_json, use_cases_json, benchmark_points_json, korea_opportunity, generated_at").in("entity_id", ids).order("generated_at", { ascending: false }),
  ]);

  if (scoreError) throw new Error(`트렌드 점수 조회 실패: ${scoreError.message}`);
  if (analysisError) throw new Error(`AI 분석 조회 실패: ${analysisError.message}`);

  const scores = latestByEntity(z.array(scoreSchema).parse(scoreData ?? []));
  const analyses = latestByEntity(z.array(analysisSchema).parse(analysisData ?? []));

  return entities
    .map((entity) => {
      const score = scores.get(entity.id);
      const analysis = analyses.get(entity.id);
      const totalScore = Math.round((score?.total_score ?? 0) * 10) / 10;
      const source = inferSources(entity.github_url)[0]!;
      const status: TrendStatus = score?.status ?? entity.status;
      const description = analysis?.summary ?? entity.description ?? "수집 신호를 기반으로 검토·승인된 AI 서비스입니다.";
      const fallbackReason = "초기 수집 신호가 확인되어 관리자의 검토를 통과했습니다.";

      return {
        id: entity.id,
        slug: entity.slug,
        name: entity.name,
        logoText: entity.name.slice(0, 2).toUpperCase(),
        // 공개 화면에는 원문(대부분 영어)보다 검증된 한국어 AI 요약을 우선 노출한다.
        tagline: description,
        description,
        category: entity.categories?.name ?? "기타",
        canonicalUrl: entity.canonical_url,
        ...(entity.github_url ? { githubUrl: entity.github_url } : {}),
        pricingType: entity.pricing_type,
        isOpenSource: entity.is_open_source,
        status,
        rank: 0,
        rankChange: 0,
        trendScore: totalScore,
        trustScore: Math.round((score?.trust_score ?? 0) * 10) / 10,
        scoreBreakdown: {
          crossSource: score?.cross_source_score ?? 0,
          velocity: score?.velocity_score ?? 0,
          productGrowth: score?.product_growth_score ?? 0,
          threads: score?.threads_score ?? 0,
          reddit: score?.reddit_score ?? 0,
          novelty: score?.novelty_score ?? 0,
          instagram: score?.instagram_score ?? 0,
          quality: score?.quality_score ?? 0,
        },
        sources: inferSources(entity.github_url),
        signals: [{
          source,
          label: source === "github" ? "GitHub 감지 점수" : "Hacker News 감지 점수",
          value: totalScore,
          delta24h: Math.round(score?.velocity_score ?? 0),
          unit: "engagement",
          measuredAt: score?.calculated_at ?? entity.last_detected_at,
          reliability: "estimated",
        }],
        whyTrending: analysis?.why_trending_json.length ? analysis.why_trending_json : [fallbackReason],
        strengths: analysis?.strengths_json.length ? analysis.strengths_json : ["분석 데이터 생성 대기 중"],
        weaknesses: analysis?.weaknesses_json.length ? analysis.weaknesses_json : ["추가 출처 교차 검증 필요"],
        useCases: analysis?.use_cases_json.length ? analysis.use_cases_json : ["서비스 공식 문서 확인 필요"],
        targetUsers: analysis?.target_users_json.length ? analysis.target_users_json : ["AI 도구 탐색 사용자"],
        benchmarkPoints: analysis?.benchmark_points_json ?? [],
        koreaOpportunity: analysis?.korea_opportunity ?? "국내 적용 가능성은 추가 분석이 필요합니다.",
        updatedAt: score?.calculated_at ?? entity.last_detected_at,
        firstDetectedAt: entity.first_detected_at,
        sparkline: [totalScore, totalScore],
      } satisfies TrendEntity;
    })
    .sort((a, b) => b.trendScore - a.trendScore)
    .map((trend, index) => ({ ...trend, rank: index + 1 }));
});

export const getPublishedTrend = cache(async (slug: string) => {
  const trends = await getPublishedTrends();
  return trends.find((trend) => trend.slug === slug);
});
