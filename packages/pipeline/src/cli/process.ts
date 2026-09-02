import { loadWorkspaceEnvironment } from "@ai-trend-radar/collectors";
import { createCategoryClassifierFromEnv } from "@ai-trend-radar/llm";
import { analysisBudgetMinutesFromEnv, analysisLimitFromEnv, autoApproveAnalyzedFromEnv } from "../config";
import { BOOTSTRAP_SCORING_VERSION } from "../initial-score";
import { createTrendAnalysisProviderFromSettings } from "../llm-provider-settings";
import { SupabasePipelineRepository } from "../repository";
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
 * 최근에 오늘자 채점을 마쳤으면 건너뛴다(--force 로 무시).
 *
 * 예약 실행을 두 개로 늘렸기 때문이다(scheduled-pipeline.yml 참고). GitHub 이 예약을 건너뛰는 날은
 * 둘 중 하나만 돌고, 둘 다 도는 날은 두 번째가 여기서 빠져 원본 전량 읽기와 러너 시간을 아낀다.
 * 분석 전용 실행(hourly-analysis)은 채점을 하지 않으므로 이 판단과 무관하다.
 */
const RESCORE_INTERVAL_MINUTES = 150;
if (!skipAnalysis || analysisOnly || process.argv.includes("--force")) {
  // 분석을 동반하는 실행은 언제나 진행한다 — 분석 대기열은 채점과 별개로 소진해야 한다.
} else {
  const scoreDate = new Date().toISOString().slice(0, 10);
  const latest = await repository.latestSnapshotAt(scoreDate, BOOTSTRAP_SCORING_VERSION);
  const minutesAgo = latest ? (Date.now() - latest.getTime()) / 60_000 : Number.POSITIVE_INFINITY;
  if (minutesAgo < RESCORE_INTERVAL_MINUTES) {
    process.stdout.write(`${JSON.stringify({ skipped: true, reason: `오늘자(${scoreDate}) 채점이 ${Math.round(minutesAgo)}분 전에 끝났습니다. ${RESCORE_INTERVAL_MINUTES}분 안에는 다시 채점하지 않습니다(--force 로 무시).` }, null, 2)}\n`);
    process.exit(0);
  }
}

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
