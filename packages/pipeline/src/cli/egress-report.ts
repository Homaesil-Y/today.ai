import { existsSync, readFileSync } from "node:fs";
import { loadWorkspaceEnvironment } from "@ai-trend-radar/collectors";
import {
  billingCycleStart,
  evaluateEgressBudget,
  formatBytes,
  parseBillingCycleDay,
} from "@ai-trend-radar/types/egress";
import { createClient } from "@supabase/supabase-js";
import { isMissingMeterObject, parseMeterLines } from "../egress-report";

/**
 * 워크플로 마지막 단계: 이번 실행이 쓴 Supabase 전송량을 기록하고, 이번 결제 주기 사용량을 점검한다.
 *
 * 2026-10-06 Supabase 가 egress 한도(월 5GB) 초과로 프로젝트를 차단할 때까지 아무도 몰랐다. Supabase 는
 * 사용량을 가져올 API 가 없어서, 우리 코드가 받은 응답 크기를 직접 재 public.egress_meter_daily 에 쌓고
 * 여기서 한도와 비교한다. 위험 단계(alert)면 이 단계를 실패시켜 GitHub 실패 메일로 알린다.
 *
 * 기록·조회 자체가 실패하면(테이블 미적용, 프로젝트 차단 등) 경고만 남기고 성공으로 끝낸다 — 계량
 * 문제로 워크플로를 깨뜨리지 않는다. 판정 규칙은 packages/types/src/egress.ts.
 */
const env = loadWorkspaceEnvironment();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !secretKey) {
  process.stderr.write("NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SECRET_KEY 가 없어 전송량 점검을 건너뜁니다.\n");
  process.exit(0);
}

// 이 CLI 의 요청(기록 몇 건·조회 1건)은 수 KB 라 계량하지 않는다.
const client = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
const meterFile = process.env.EGRESS_METER_FILE;
const entries = meterFile && existsSync(meterFile) ? parseMeterLines(readFileSync(meterFile, "utf8")) : [];
const workflow = process.env.GITHUB_WORKFLOW ?? "local";

const warnings: string[] = [];
let recorded = 0;
for (const entry of entries) {
  const { error } = await client.rpc("record_egress", {
    p_day: entry.day,
    p_source: `gh:${entry.label}`,
    p_requests: entry.requests,
    p_bytes: Math.round(entry.bytes),
  });
  if (error) {
    warnings.push(isMissingMeterObject(error)
      ? "계량 테이블이 없습니다 — supabase/migrations/202610070001_egress_meter.sql 을 실행하세요."
      : `전송량 기록 실패: ${error.message}`);
    break;
  }
  recorded += 1;
}

const now = new Date();
const cycleDay = parseBillingCycleDay(env.SUPABASE_BILLING_CYCLE_DAY);
// 최근 속도를 재려면 주기 시작 전 며칠도 필요하다(주기 첫날에도 어제 값을 보도록).
const from = new Date(billingCycleStart(now, cycleDay).getTime() - 3 * 86_400_000).toISOString().slice(0, 10);
const { data, error } = await client
  .from("egress_meter_daily")
  .select("day,source,requests,bytes")
  .gte("day", from);

const thisRun = entries.map((entry) => ({ label: entry.label, requests: entry.requests, size: formatBytes(entry.bytes) }));
if (error) {
  warnings.push(isMissingMeterObject(error)
    ? "계량 테이블이 없습니다 — supabase/migrations/202610070001_egress_meter.sql 을 실행하세요."
    : `전송량 조회 실패: ${error.message}`);
  process.stdout.write(`${JSON.stringify({ workflow, thisRun, recorded, warnings: [...new Set(warnings)] }, null, 2)}\n`);
  process.exit(0);
}

const rows = (data ?? []).map((row) => ({ day: String(row.day), source: String(row.source), bytes: Number(row.bytes) || 0 }));
const budget = evaluateEgressBudget({ days: rows, now, cycleDay });
const today = now.toISOString().slice(0, 10);
const todayBySource = rows
  .filter((row) => row.day === today)
  .sort((a, b) => b.bytes - a.bytes)
  .map((row) => `${row.source} ${formatBytes(row.bytes)}`);

process.stdout.write(`${JSON.stringify({
  workflow,
  thisRun,
  recorded,
  cycle: `${budget.cycleStart} ~ ${budget.nextCycleStart}`,
  used: `${formatBytes(budget.usedBytes)} (${Math.round(budget.usedShare * 100)}%)${budget.coversWholeCycle ? "" : ` — ${budget.firstMeteredDay ?? "오늘"} 이전은 계량 전`}`,
  recentDaily: formatBytes(budget.recentDailyBytes),
  projected: `${formatBytes(budget.projectedBytes)} (${Math.round(budget.projectedShare * 100)}%)`,
  today: formatBytes(budget.todayBytes),
  todayBySource,
  level: budget.level,
  reasons: budget.reasons,
  ...(warnings.length > 0 ? { warnings: [...new Set(warnings)] } : {}),
}, null, 2)}\n`);

if (budget.level === "alert") {
  process.stderr.write(
    `Supabase 전송량 위험: ${budget.reasons.join(" / ")}\n`
    + "Supabase 대시보드(Organization → Usage)에서 실제 값을 확인하고, 위 todayBySource 에서 큰 출처를 줄이세요.\n",
  );
  // 실패(=메일)는 지정한 워크플로에서만 낸다. 모든 워크플로가 실패하면 하루 20통 가까이 몰린다.
  if (process.env.EGRESS_FAIL_ON_ALERT === "true") process.exitCode = 1;
}
