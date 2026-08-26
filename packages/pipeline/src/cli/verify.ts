import { loadWorkspaceEnvironment } from "@ai-trend-radar/collectors";
import { createClient } from "@supabase/supabase-js";
import { BOOTSTRAP_SCORING_VERSION } from "../initial-score";

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
}, null, 2)}\n`);
