import { loadWorkspaceEnvironment } from "@ai-trend-radar/collectors";
import { createCategoryClassifierFromEnv } from "@ai-trend-radar/llm";
import { describeBrake, parseBillingCycleDay } from "@ai-trend-radar/types/egress";
import { analysisBudgetMinutesFromEnv, analysisLimitFromEnv, autoApproveAnalyzedFromEnv } from "../config";
import { BOOTSTRAP_SCORING_VERSION } from "../initial-score";
import { createTrendAnalysisProviderFromSettings } from "../llm-provider-settings";
import { SupabasePipelineRepository } from "../repository";
import { brakeFromMeter, decideRun, meterSinceDay } from "../run-brake";
import { runEntityPipeline } from "../runner";

const env = loadWorkspaceEnvironment();
const skipAnalysis = process.argv.includes("--skip-analysis");
// 엔티티·점수 재기록 없이 기존 엔티티만 분석한다. 분석 재시도 워크플로용 —
// 수집·기록은 scheduled-pipeline 이 30분 간격으로 이미 하고 있어 여기서 반복할 이유가 없다.
const analysisOnly = process.argv.includes("--analysis-only");
const analysisLimit = analysisLimitFromEnv(env.GEMINI_ANALYSIS_LIMIT);
// 엔티티 처리에 이미 쓴 시간까지 포함해 마감을 잡는다(프로세스 시작 기준).
const analysisDeadline = new Date(Date.now() + analysisBudgetMinutesFromEnv(env.ANALYSIS_BUDGET_MINUTES) * 60_000);
const repository = SupabasePipelineRepository.fromEnvironment(env);

/**
 * 이번 실행을 할지 정한다(--force 로 무시). 규칙은 run-brake.ts.
 *
 * 채점 실행: 최근에 오늘자 채점을 마쳤으면 건너뛴다. 예약 실행이 두 개라(scheduled-pipeline.yml) 둘 다 도는
 * 날은 두 번째가 여기서 빠져 원본 전량 읽기와 러너 시간을 아낀다. 간격은 평소 150분이고, Supabase 전송량이
 * 경고·위험 단계면 자동 브레이크로 늘어난다. 분석 실행: 평소엔 늘 돌고, 브레이크가 걸리면 간격을 둔다.
 */
const mode = analysisOnly ? "analysis" : skipAnalysis ? "score" : "full";
const now = new Date();
const minutesSince = (at: Date | null) => (at ? (now.getTime() - at.getTime()) / 60_000 : null);
const cycleDay = parseBillingCycleDay(env.SUPABASE_BILLING_CYCLE_DAY);
const brake = brakeFromMeter(await repository.loadEgressDays(meterSinceDay(now, cycleDay)), now, cycleDay);
const decision = decideRun({
  mode,
  force: process.argv.includes("--force"),
  brake,
  minutesSinceScore: mode === "score"
    ? minutesSince(await repository.latestSnapshotAt(now.toISOString().slice(0, 10), BOOTSTRAP_SCORING_VERSION))
    : null,
  minutesSinceAnalysis: mode === "analysis" && brake.analysisIntervalMinutes > 0
    ? minutesSince(await repository.latestAnalysisAt())
    : null,
});
if (!decision.run) {
  process.stdout.write(`${JSON.stringify({ skipped: true, egressBrake: brake.level, reason: decision.reason }, null, 2)}\n`);
  process.exit(0);
}
if (brake.level !== "ok") process.stdout.write(`전송량 자동 브레이크(${brake.level}): ${describeBrake(brake)}\n`);

// 분석 프로바이더는 관리자가 /admin/settings에서 고른 값(app_settings.trend_analysis_llm)을 따른다.
// 카테고리 분류는 항상 Gemini 그대로 둔다(이번 전환 범위는 트렌드 분석만).
const result = await runEntityPipeline({
  repository,
  ...(!skipAnalysis
    ? { analysisProvider: await createTrendAnalysisProviderFromSettings(env, repository), categoryClassifier: createCategoryClassifierFromEnv(env) }
    : {}),
  analysisLimit,
  analysisDeadline,
  analysisOnly,
  autoApproveAnalyzed: autoApproveAnalyzedFromEnv(env.AUTO_APPROVE_ANALYZED),
});

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
