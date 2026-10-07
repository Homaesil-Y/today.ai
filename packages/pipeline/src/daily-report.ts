import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { BOOTSTRAP_SCORING_VERSION } from "./initial-score";

/**
 * 일간 리포트의 상위 서비스 목록.
 *
 * 예전엔 공개 엔티티 전부를 읽으면서 엔티티마다 trend_scores 와 ai_analyses 를 **전체 이력**으로 붙여
 * 받은 뒤, 클라이언트에서 최신 1건씩만 골랐다. 2026-10-06 기준 점수 7만 행·분석 1.6만 행(한국어 요약
 * 포함)을 파이프라인 실행마다(하루 5~8회) 받은 셈이다 — Supabase egress 한도 초과로 프로젝트가 차단된
 * 원인 중 하나다. 실제로 필요한 건 "가장 최근 채점일의 상위 N건 + 그 N건의 요약 + 공개 수"뿐이라 그것만
 * 읽는다. 이력이 쌓여도 읽는 양이 늘지 않는다(약 10KB).
 */
export type DailyReportService = {
  rank: number;
  slug: string;
  name: string;
  category: string;
  trendScore: number;
  trustScore: number;
  status: string;
  summary: string | null;
};

const topRowSchema = z.object({
  entity_id: z.string(),
  total_score: z.coerce.number(),
  trust_score: z.coerce.number(),
  status: z.string(),
  entities: z.object({
    slug: z.string(),
    name: z.string(),
    categories: z.object({ name: z.string() }).nullable().catch(null),
  }),
});

const summaryRowSchema = z.object({ entity_id: z.string(), summary: z.string() });

export async function loadDailyReportTop(client: SupabaseClient, topN: number, scoringVersion = BOOTSTRAP_SCORING_VERSION) {
  const publicCount = await client
    .from("entities")
    .select("id", { count: "exact", head: true })
    .eq("visibility", "public");
  if (publicCount.error) throw new Error(`공개 엔티티 수 조회 실패: ${publicCount.error.message}`);
  const totalPublic = publicCount.count ?? 0;

  // 가장 최근 채점일. 오늘(UTC) 채점이 아직 없어도 직전 날의 순위로 리포트를 만든다.
  const anchor = await client
    .from("trend_scores")
    .select("score_date")
    .eq("scoring_version", scoringVersion)
    .order("score_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (anchor.error) throw new Error(`최근 채점일 조회 실패: ${anchor.error.message}`);
  const scoreDate = z.object({ score_date: z.string() }).nullable().catch(null).parse(anchor.data)?.score_date ?? null;
  if (!scoreDate || totalPublic === 0) return { totalPublic, scoreDate, topServices: [] as DailyReportService[] };

  const top = await client
    .from("trend_scores")
    .select("entity_id,total_score,trust_score,status,entities!inner(slug,name,visibility,categories(name))")
    .eq("scoring_version", scoringVersion)
    .eq("score_date", scoreDate)
    .eq("entities.visibility", "public")
    .order("total_score", { ascending: false })
    .order("trust_score", { ascending: false })
    .limit(topN);
  if (top.error) throw new Error(`상위 서비스 조회 실패: ${top.error.message}`);
  const rows = z.array(topRowSchema).parse(top.data ?? []);

  const summaries = new Map<string, string>();
  if (rows.length > 0) {
    // 엔티티별 최신 1행 뷰. ai_analyses 를 직접 읽으면 재분석 이력까지 온다.
    const analyses = await client
      .from("latest_ai_analyses")
      .select("entity_id,summary")
      .in("entity_id", rows.map((row) => row.entity_id));
    if (analyses.error) throw new Error(`요약 조회 실패: ${analyses.error.message}`);
    for (const row of z.array(summaryRowSchema).parse(analyses.data ?? [])) summaries.set(row.entity_id, row.summary);
  }

  const topServices: DailyReportService[] = rows.map((row, index) => ({
    rank: index + 1,
    slug: row.entities.slug,
    name: row.entities.name,
    category: row.entities.categories?.name ?? "기타",
    trendScore: row.total_score,
    trustScore: row.trust_score,
    status: row.status,
    summary: summaries.get(row.entity_id) ?? null,
  }));
  return { totalPublic, scoreDate, topServices };
}
