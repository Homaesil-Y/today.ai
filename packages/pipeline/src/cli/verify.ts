import { loadWorkspaceEnvironment } from "@ai-trend-radar/collectors";
import { TREND_ANALYSIS_PROMPT_VERSION } from "@ai-trend-radar/llm";
import { createClient } from "@supabase/supabase-js";
import { BOOTSTRAP_SCORING_VERSION } from "../initial-score";
import { REANALYSIS_INTERVAL_HOURS } from "../runner";

const env = loadWorkspaceEnvironment();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = env.SUPABASE_SECRET_KEY;

if (!url || !secretKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required");
}

const client = createClient(url, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const tables = [
  "raw_items",
  "entities",
  "entity_mentions",
  "metric_snapshots",
  "trend_scores",
  "ai_analyses",
] as const;

const counts: Record<(typeof tables)[number], number> = {
  raw_items: 0,
  entities: 0,
  entity_mentions: 0,
  metric_snapshots: 0,
  trend_scores: 0,
  ai_analyses: 0,
};

for (const table of tables) {
  const result = await client.from(table).select("id", { count: "exact", head: true });
  if (result.error) {
    throw new Error(`Failed to count ${table}: ${result.error.message}`);
  }
  counts[table] = result.count ?? 0;
}

/**
 * 오늘자 스냅샷의 상태 분포와 순위 대상 수.
 *
 * 행 개수만 세던 시절엔 "저장은 됐는데 결과가 말이 안 되는" 고장을 하나도 못 잡았다 — 공개
 * 786건 전부가 WATCH 였던 것도, 순위 하위 절반이 동점 덩어리였던 것도 개수는 정상이었다.
 * 여기 찍어두면 매 실행(하루 16회)의 GitHub Actions 로그가 시각별 분포 기록이 되어, 분포가
 * 무너진 시점을 로그만으로 특정할 수 있다.
 *
 * head:true 카운트 쿼리라 행 데이터를 옮기지 않는다(회당 수백 바이트, egress 부담 없음).
 */
const scoreDate = new Date().toISOString().slice(0, 10);
const statuses = ["NEW", "WATCH", "RISING", "SURGING", "PEAK", "STABLE", "FALLING", "REVIVAL"] as const;
const todayScores: Record<string, number> = {};
for (const status of statuses) {
  const result = await client
    .from("trend_scores")
    .select("id", { count: "exact", head: true })
    .eq("score_date", scoreDate)
    .eq("scoring_version", BOOTSTRAP_SCORING_VERSION)
    .eq("status", status);
  if (result.error) throw new Error(`Failed to count status ${status}: ${result.error.message}`);
  if (result.count) todayScores[status] = result.count;
}
const rankedResult = await client
  .from("trend_scores")
  .select("id", { count: "exact", head: true })
  .eq("score_date", scoreDate)
  .eq("scoring_version", BOOTSTRAP_SCORING_VERSION)
  .eq("ranked", true);
if (rankedResult.error) throw new Error(`Failed to count ranked: ${rankedResult.error.message}`);

/**
 * 분석 백로그 — 실행 결과가 success 여도 여기서 막혀 있으면 상세 페이지 내용이 낡는다.
 *
 * 2026-09-15 에 실제로 놓친 것: 실행은 전부 success 인데 Gemini 무료 한도(분당 15회)에 매번 걸려
 * 실행마다 50건 상한을 못 채우고, 재분석 대기가 573 → 663 으로 늘고 있었다. 오류가 파이프라인
 * 결과의 analysisErrors 로 삼켜져 실행 결론에는 드러나지 않았다. 그래서 여기서 대기열을 세어
 * 매 실행 로그에 남긴다 — 하루 16회 실행이므로 로그 자체가 추세 기록이 된다.
 */
const staleBefore = new Date(Date.now() - REANALYSIS_INTERVAL_HOURS * 3_600_000).toISOString();
const publicCount = await client.from("entities").select("id", { count: "exact", head: true }).eq("visibility", "public");
const analyzedFresh = await client
  .from("ai_analyses")
  .select("entity_id", { count: "exact", head: true })
  .eq("prompt_version", TREND_ANALYSIS_PROMPT_VERSION)
  .gte("generated_at", staleBefore);
const unanalyzedReview = await client
  .from("entities")
  .select("id, ai_analyses(id)", { count: "exact", head: true })
  .eq("visibility", "review");

const totalToday = Object.values(todayScores).reduce((sum, value) => sum + value, 0);
process.stdout.write(`${JSON.stringify({
  ...counts,
  today: {
    scoreDate,
    scoringVersion: BOOTSTRAP_SCORING_VERSION,
    snapshots: totalToday,
    ranked: rankedResult.count ?? 0,
    unranked: totalToday - (rankedResult.count ?? 0),
    status: todayScores,
  },
  // 분석이 따라잡고 있는지. freshAnalyses 가 publicEntities 에 한참 못 미치면 백로그가 쌓이는 중이다.
  analysisBacklog: {
    promptVersion: TREND_ANALYSIS_PROMPT_VERSION,
    publicEntities: publicCount.count ?? 0,
    freshAnalysesInWindow: analyzedFresh.count ?? 0,
    windowHours: REANALYSIS_INTERVAL_HOURS,
    reviewCandidates: unanalyzedReview.count ?? 0,
    // 재분석 주기(runner.ts 의 REANALYSIS_INTERVAL_HOURS) 안에 분석된 비율. 100%에 가까울수록 건강하다.
    coveragePercent: publicCount.count ? Math.round(((analyzedFresh.count ?? 0) / publicCount.count) * 100) : 0,
  },
}, null, 2)}\n`);
