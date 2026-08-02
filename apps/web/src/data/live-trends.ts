import type { TrendEntity, TrendStatus } from "@ai-trend-radar/types";
import { unstable_cache } from "next/cache";
import { cache } from "react";
import { z } from "zod";
import { createPublicClient } from "@/lib/supabase/server";
import { cleanDisplayName, logoTextFrom } from "./display-name";
import { resolveSources, sourceSignalLabel } from "./entity-sources";
import { compareByScore } from "./trend-query";

// 공개 데이터는 3시간 주기 파이프라인으로만 바뀌므로 요청마다 Supabase를 다시 치지 않는다.
// unstable_cache로 서버에서 교차 요청 캐싱(180초)해 TTFB를 줄인다. createPublicClient는 쿠키를
// 읽지 않으므로(익명 클라이언트) 안전하다. react cache()는 같은 요청 내 중복 호출만 합친다.
const TRENDS_REVALIDATE_SECONDS = 180;

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
  // 파이프라인이 저장 시점에 기록한 실제 유입 채널. 백필 전 행은 빈 배열일 수 있다.
  source_codes: z.array(z.string()).catch([]),
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


// 점수 이력(최신→과거)을 과거→최신 순의 스파크라인으로 만든다.
// 스냅샷이 2개 미만이면 아직 추세가 없으므로 평평한 선(같은 값 2개)을 그린다.
function buildSparkline(history: number[] | undefined, fallback: number): number[] {
  if (history && history.length >= 2) return [...history].reverse().slice(-12);
  return [fallback, fallback];
}

function latestByEntity<T extends { entity_id: string }>(rows: T[]) {
  const map = new Map<string, T>();
  for (const row of rows) if (!map.has(row.entity_id)) map.set(row.entity_id, row);
  return map;
}

export const getPublishedTrends = cache(unstable_cache(async (): Promise<TrendEntity[]> => {
  const supabase = createPublicClient();
  const { data: entityData, error: entityError } = await supabase
    .from("entities")
    .select("id, slug, name, canonical_url, github_url, description, pricing_type, is_open_source, first_detected_at, last_detected_at, status, source_codes, categories(name)")
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

  const parsedScores = z.array(scoreSchema).parse(scoreData ?? []);
  const scores = latestByEntity(parsedScores);
  const analyses = latestByEntity(z.array(analysisSchema).parse(analysisData ?? []));

  // 이미 조회한 점수 행(최신→과거 정렬)으로 엔티티별 이력을 만든다. 추가 쿼리 없음.
  const scoreHistoryByEntity = new Map<string, number[]>();
  for (const row of parsedScores) {
    const list = scoreHistoryByEntity.get(row.entity_id) ?? [];
    list.push(Math.round(row.total_score * 10) / 10);
    scoreHistoryByEntity.set(row.entity_id, list);
  }

  // 순위 변동(▲▼): 스냅샷이 2개 이상 쌓인 엔티티들만 대상으로 현재 점수 순위와 직전 스냅샷 점수 순위를 비교한다.
  // 이력이 부족한 엔티티는 0(“—”/“초기 집계”)으로 두어 데이터가 없을 때 가짜 변동을 보이지 않는다.
  const rankChangeByEntity = new Map<string, number>();
  const eligible = [...scoreHistoryByEntity.entries()].filter(([, list]) => list.length >= 2);
  if (eligible.length >= 2) {
    const currentRank = new Map<string, number>();
    const previousRank = new Map<string, number>();
    [...eligible].sort((a, b) => (b[1][0] ?? 0) - (a[1][0] ?? 0)).forEach(([id], index) => currentRank.set(id, index + 1));
    [...eligible].sort((a, b) => (b[1][1] ?? 0) - (a[1][1] ?? 0)).forEach(([id], index) => previousRank.set(id, index + 1));
    for (const [id] of eligible) {
      const change = (previousRank.get(id) ?? 0) - (currentRank.get(id) ?? 0);
      if (change !== 0) rankChangeByEntity.set(id, change);
    }
  }

  return entities
    .map((entity) => {
      const score = scores.get(entity.id);
      const analysis = analyses.get(entity.id);
      const totalScore = Math.round((score?.total_score ?? 0) * 10) / 10;
      const sources = resolveSources(entity.source_codes, entity.github_url);
      const source = sources[0]!;
      const status: TrendStatus = score?.status ?? entity.status;
      const description = analysis?.summary ?? entity.description ?? "수집 신호를 기반으로 검토·승인된 AI 서비스입니다.";
      const fallbackReason = "초기 수집 신호가 확인되어 관리자의 검토를 통과했습니다.";
      // 수집기가 저장한 문장형 원본 이름을 공개 화면용으로 다듬는다(원본 데이터는 불변).
      const displayName = cleanDisplayName(entity.name);

      return {
        id: entity.id,
        slug: entity.slug,
        name: displayName,
        logoText: logoTextFrom(displayName),
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
        rankChange: rankChangeByEntity.get(entity.id) ?? 0,
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
        sources,
        signals: [{
          source,
          label: sourceSignalLabel(source),
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
        sparkline: buildSparkline(scoreHistoryByEntity.get(entity.id), totalScore),
      } satisfies TrendEntity;
    })
    .sort(compareByScore)
    .map((trend, index) => ({ ...trend, rank: index + 1 }));
}, ["published-trends"], { revalidate: TRENDS_REVALIDATE_SECONDS, tags: ["trends"] }));

export const getPublishedTrend = cache(async (slug: string) => {
  const trends = await getPublishedTrends();
  return trends.find((trend) => trend.slug === slug);
});

const historyRowSchema = z.object({ total_score: z.coerce.number(), calculated_at: z.string() });

export type TrendScoreHistoryPoint = { measuredAt: string; score: number };

// 파이프라인이 실행될 때마다 쌓이는 실제 스냅샷(trend_scores) 이력을 시간순으로 반환한다.
// 기간 탭(24H/7D/30D/90D)이 실제 데이터로 동작하도록 상세 페이지에서 사용한다.
export const getTrendScoreHistory = cache(unstable_cache(async (entityId: string): Promise<TrendScoreHistoryPoint[]> => {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("trend_scores")
    .select("total_score, calculated_at")
    .eq("entity_id", entityId)
    .order("calculated_at", { ascending: true });
  if (error) throw new Error(`트렌드 점수 이력 조회 실패: ${error.message}`);
  return z.array(historyRowSchema).parse(data ?? []).map((row) => ({
    measuredAt: row.calculated_at,
    score: Math.round(row.total_score * 10) / 10,
  }));
}, ["trend-score-history"], { revalidate: TRENDS_REVALIDATE_SECONDS, tags: ["trends"] }));
