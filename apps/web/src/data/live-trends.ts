import type { TrendEntity, TrendStatus } from "@ai-trend-radar/types";
import { unstable_cache } from "next/cache";
import { cache } from "react";
import { z } from "zod";
import { cacheBucket } from "@/lib/cache-bucket";
import { readAllByIds, readAllPages } from "@/lib/supabase-paging";
import { createPublicClient } from "@/lib/supabase/server";
import { cleanDisplayName, logoTextFrom } from "./display-name";
import { resolveSources, sourceSignalLabel } from "./entity-sources";
import { keepLatestScoringVersion } from "./scoring-version";
import { compareByScore } from "./trend-query";

/**
 * 공개 데이터 캐시 주기.
 *
 * 데이터는 3시간 주기 파이프라인으로만 바뀌므로 그보다 잦게 다시 읽을 이유가 없다. 180초로
 * 두었더니 하루 480번 미스가 나고, 미스마다 목록 전체를 Supabase 에서 다시 받아 egress 를
 * 태웠다 — 무료 한도 5GB/월에 대해 계산상 월 112GB 규모였고, 실제로 8/22 하루에 2.8GB 를 쓰고
 * 프로젝트가 한도 초과(7.09GB) 상태가 됐다. 초과 상태에서는 응답이 제한돼 사이트가 느려진다.
 *
 * 30분이면 3시간 파이프라인 기준 충분히 신선하고, 하루 48회 미스로 내려간다.
 */
const TRENDS_REVALIDATE_SECONDS = 1_800;

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

// 점수 축별 세부값(cross_source·velocity·novelty 등)은 화면에서 렌더하지 않으므로 가져오지 않는다.
// 8개 컬럼 x 7,686행이라 전송량에서 차지하는 비중이 컸다.
const scoreSchema = z.object({
  entity_id: z.string(),
  total_score: z.coerce.number(),
  trust_score: z.coerce.number(),
  status: z.enum(["NEW", "RISING", "SURGING", "PEAK", "STABLE", "FALLING", "REVIVAL", "WATCH"]),
  // 반응 신호가 하한 미달이면 false. 순위표에서만 빠지고 검색·카테고리·상세에는 그대로 남는다.
  // 컬럼이 채워지기 전 행이나 예상 못한 값은 순위에 남기는 쪽(true)으로 둔다 — 배포 순서 때문에
  // 순위표가 통째로 비는 일이 없어야 한다.
  ranked: z.boolean().catch(true),
  scoring_version: z.string(),
  calculated_at: z.string(),
});

/**
 * 목록이 실제로 렌더하는 분석 필드만. 상세 전용 배열(강점·약점·활용 사례·추천 대상·국내 기회)은
 * 목록에서 쓰지 않는데도 함께 받아, 762건을 얻으려고 5,247행 약 4.4MB 를 옮기고 있었다.
 * 상세·비교 페이지는 자기 화면에 필요한 몇 건만 loadTrendAnalysis 로 따로 가져온다.
 */
const listAnalysisSchema = z.object({
  entity_id: z.string(),
  summary: z.string(),
  why_trending_json: z.array(z.string()).catch([]),
  generated_at: z.string(),
});

const analysisSchema = z.object({
  entity_id: z.string(),
  summary: z.string(),
  why_trending_json: z.array(z.string()).catch([]),
  target_users_json: z.array(z.string()).catch([]),
  strengths_json: z.array(z.string()).catch([]),
  weaknesses_json: z.array(z.string()).catch([]),
  use_cases_json: z.array(z.string()).catch([]),
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

// `_bucket` 은 캐시 키를 주기적으로 회전시키기 위한 인자다. 값 자체는 쓰지 않는다 —
// unstable_cache 의 revalidate 가 갱신되지 않는 문제를 우회한다(lib/cache-bucket.ts 참고).
const loadPublishedTrends = unstable_cache(async (_bucket: number): Promise<TrendEntity[]> => {
  const supabase = createPublicClient();
  // 공개 엔티티는 하루 20~26건씩 늘어난다(2026-08-12 기준 577건). 상한 없이 읽으면 1000건을
  // 넘는 순간 뒷부분이 조용히 사라져 목록에서 서비스가 누락된다.
  const entityData = await readAllPages(async (from, to) => {
    const { data, error } = await supabase
      .from("entities")
      .select("id, slug, name, canonical_url, github_url, description, pricing_type, is_open_source, first_detected_at, last_detected_at, status, source_codes, categories(name)")
      .eq("visibility", "public")
      .order("last_detected_at", { ascending: false })
      .range(from, to);
    if (error) throw new Error(`공개 서비스 조회 실패: ${error.message}`);
    return data ?? [];
  });
  const entities = z.array(entitySchema).parse(entityData);
  if (entities.length === 0) return [];

  // id 목록을 청크로 나눠 각 청크를 끝까지 읽는다. 한 번에 넣으면 (1) 1000행 상한에서 이력이
  // 조용히 잘리고 (2) URL 이 요청 헤드 한도를 넘는다. 배경은 lib/supabase-paging.ts 참고.
  const ids = entities.map(({ id }) => id);
  const [scoreData, analysisData] = await Promise.all([
    readAllByIds(ids, async (chunk, from, to) => {
      const { data, error } = await supabase
        .from("trend_scores")
        .select("entity_id, total_score, trust_score, status, ranked, scoring_version, calculated_at")
        .in("entity_id", chunk)
        .order("calculated_at", { ascending: false })
        .range(from, to);
      if (error) throw new Error(`트렌드 점수 조회 실패: ${error.message}`);
      return data ?? [];
    }),
    // latest_ai_analyses 는 엔티티별 최신 1행만 돌려주는 뷰다. ai_analyses 를 직접 읽으면
    // 재분석 이력까지 와서, 770건이 필요한데 5,247행(4.9MB)을 옮기고 클라이언트에서 최신만
    // 골라내야 했다. 뷰로는 770행 641KB 다. id 필터가 없어 청크도 필요 없다.
    readAllPages(async (from, to) => {
      const { data, error } = await supabase
        .from("latest_ai_analyses")
        .select("entity_id, summary, why_trending_json, generated_at")
        .range(from, to);
      if (error) throw new Error(`AI 분석 조회 실패: ${error.message}`);
      return data ?? [];
    }),
  ]);

  // 척도가 섞인 이력을 그대로 쓰면 24H 변화·스파크라인·순위 변동이 전부 가짜가 된다.
  const parsedScores = keepLatestScoringVersion(z.array(scoreSchema).parse(scoreData ?? []));
  const scores = latestByEntity(parsedScores);
  const analyses = latestByEntity(z.array(listAnalysisSchema).parse(analysisData));

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
  // 순위 대상만 놓고 비교한다. 제외 엔티티까지 넣으면 "▲3"이 화면의 순위 번호(순위 대상만 매김)와
  // 어긋난 칸수를 가리킨다.
  const eligible = [...scoreHistoryByEntity.entries()]
    .filter(([id, list]) => list.length >= 2 && (scores.get(id)?.ranked ?? true));
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

  const sorted = entities
    .map((entity) => {
      const score = scores.get(entity.id);
      const analysis = analyses.get(entity.id);
      const totalScore = Math.round((score?.total_score ?? 0) * 10) / 10;
      // 이력은 최신→과거 정렬이라 [1]이 직전 스냅샷이다. 없으면 비교 불가(null).
      const history = scoreHistoryByEntity.get(entity.id);
      const previousScore = history && history.length >= 2 ? history[1] : undefined;
      const scoreDelta = previousScore === undefined
        ? null
        : Math.round((totalScore - previousScore) * 10) / 10;
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
        // 순위 대상 여부. 컬럼이 없던 시절 행은 스키마 기본값(true)으로 순위에 남는다.
        ranked: score?.ranked ?? true,
        rankChange: rankChangeByEntity.get(entity.id) ?? 0,
        trendScore: totalScore,
        trustScore: Math.round((score?.trust_score ?? 0) * 10) / 10,
        sources,
        signals: [{
          source,
          label: sourceSignalLabel(source),
          value: totalScore,
          // 직전 스냅샷과의 실제 점수 차이. 이력이 한 건뿐이면 비교 대상이 없어 null.
          delta24h: scoreDelta,
          unit: "engagement",
          measuredAt: score?.calculated_at ?? entity.last_detected_at,
          reliability: "estimated",
        }],
        whyTrending: analysis?.why_trending_json.length ? analysis.why_trending_json : [fallbackReason],
        // 목록에서는 쓰지 않는 상세 전용 필드. 상세·비교 화면이 withTrendAnalysis 로 채운다.
        strengths: [],
        weaknesses: [],
        useCases: [],
        targetUsers: [],
        koreaOpportunity: "",
        updatedAt: score?.calculated_at ?? entity.last_detected_at,
        firstDetectedAt: entity.first_detected_at,
        sparkline: buildSparkline(scoreHistoryByEntity.get(entity.id), totalScore),
      } satisfies TrendEntity;
    })
    .sort(compareByScore);

  // 순위 번호는 순위 대상에게만 매긴다. 제외된 항목은 rank 0 으로 두고 검색·카테고리·상세에는
  // 그대로 남긴다 — 반응 신호가 없어 서로 구분할 근거가 없는 항목들이라(같은 점수 수십 건)
  // 번호를 붙이면 임의 순서를 순위처럼 보여주게 된다. 배경은 pipeline 의 RANKING_SIGNAL_FLOOR.
  let rank = 0;
  return sorted.map((trend) => ({ ...trend, rank: trend.ranked ? (rank += 1) : 0 }));
}, ["published-trends"], { revalidate: TRENDS_REVALIDATE_SECONDS, tags: ["trends"] });

export const getPublishedTrends = cache(
  (): Promise<TrendEntity[]> => loadPublishedTrends(cacheBucket(TRENDS_REVALIDATE_SECONDS)),
);

export const getPublishedTrend = cache(async (slug: string) => {
  const trends = await getPublishedTrends();
  return trends.find((trend) => trend.slug === slug);
});

/**
 * 상세 전용 분석 필드를 채워 넣는다. 목록은 이 필드들을 렌더하지 않아 비워둔 채 오므로,
 * 실제로 보여주는 화면(상세 1건, 비교 최대 4건)에서만 해당 엔티티 것을 가져온다.
 */
const loadTrendAnalyses = unstable_cache(async (entityIds: string[], _bucket: number) => {
  if (entityIds.length === 0) return [];
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("latest_ai_analyses")
    .select("entity_id, summary, why_trending_json, target_users_json, strengths_json, weaknesses_json, use_cases_json, korea_opportunity, generated_at")
    .in("entity_id", entityIds);
  if (error) throw new Error(`AI 분석 상세 조회 실패: ${error.message}`);
  return z.array(analysisSchema).parse(data ?? []);
}, ["trend-analysis-detail"], { revalidate: TRENDS_REVALIDATE_SECONDS, tags: ["trends"] });

export const withTrendAnalysis = cache(async (trends: TrendEntity[]): Promise<TrendEntity[]> => {
  if (trends.length === 0) return trends;
  const rows = await loadTrendAnalyses(trends.map(({ id }) => id), cacheBucket(TRENDS_REVALIDATE_SECONDS));
  const byEntity = latestByEntity(rows);
  return trends.map((trend) => {
    const analysis = byEntity.get(trend.id);
    return {
      ...trend,
      strengths: analysis?.strengths_json.length ? analysis.strengths_json : ["분석 데이터 생성 대기 중"],
      weaknesses: analysis?.weaknesses_json.length ? analysis.weaknesses_json : ["추가 출처 교차 검증 필요"],
      useCases: analysis?.use_cases_json.length ? analysis.use_cases_json : ["서비스 공식 문서 확인 필요"],
      targetUsers: analysis?.target_users_json.length ? analysis.target_users_json : ["AI 도구 탐색 사용자"],
      koreaOpportunity: analysis?.korea_opportunity ?? "국내 적용 가능성은 추가 분석이 필요합니다.",
    };
  });
});

const historyRowSchema = z.object({ total_score: z.coerce.number(), scoring_version: z.string(), calculated_at: z.string() });

export type TrendScoreHistoryPoint = { measuredAt: string; score: number };

// 파이프라인이 실행될 때마다 쌓이는 실제 스냅샷(trend_scores) 이력을 시간순으로 반환한다.
// 기간 탭(24H/7D/30D/90D)이 실제 데이터로 동작하도록 상세 페이지에서 사용한다.
const loadTrendScoreHistory = unstable_cache(async (entityId: string, _bucket: number): Promise<TrendScoreHistoryPoint[]> => {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("trend_scores")
    .select("total_score, scoring_version, calculated_at")
    .eq("entity_id", entityId)
    .order("calculated_at", { ascending: true });
  if (error) throw new Error(`트렌드 점수 이력 조회 실패: ${error.message}`);
  const rows = z.array(historyRowSchema).parse(data ?? []);
  // 척도가 다른 구간을 한 그래프에 이어 붙이면 공식이 바뀐 날 가짜 계단이 생긴다.
  // 가장 최근 척도의 구간만 그린다(오름차순이라 마지막 행이 현재 척도).
  const currentVersion = rows[rows.length - 1]?.scoring_version;
  return rows
    .filter((row) => row.scoring_version === currentVersion)
    .map((row) => ({
      measuredAt: row.calculated_at,
      score: Math.round(row.total_score * 10) / 10,
    }));
}, ["trend-score-history"], { revalidate: TRENDS_REVALIDATE_SECONDS, tags: ["trends"] });

export const getTrendScoreHistory = cache(
  (entityId: string): Promise<TrendScoreHistoryPoint[]> =>
    loadTrendScoreHistory(entityId, cacheBucket(TRENDS_REVALIDATE_SECONDS)),
);
