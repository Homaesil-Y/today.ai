import { loadWorkspaceEnvironment } from "@ai-trend-radar/collectors";
import { createCategoryClassifierFromEnv } from "@ai-trend-radar/llm";
import { analysisBudgetMinutesFromEnv, analysisLimitFromEnv, autoApproveAnalyzedFromEnv } from "../config";
import { createTrendAnalysisProviderFromSettings } from "../llm-provider-settings";
import { SupabasePipelineRepository } from "../repository";
import { runEntityPipeline } from "../runner";

const env = loadWorkspaceEnvironment();
const skipAnalysis = process.argv.includes("--skip-analysis");
const analysisLimit = analysisLimitFromEnv(env.GEMINI_ANALYSIS_LIMIT);
// 엔티티 처리에 이미 쓴 시간까지 포함해 마감을 잡는다(프로세스 시작 기준).
const analysisDeadline = new Date(Date.now() + analysisBudgetMinutesFromEnv(env.ANALYSIS_BUDGET_MINUTES) * 60_000);
const repository = SupabasePipelineRepository.fromEnvironment(env);
// 분석 프로바이더는 관리자가 /admin/settings에서 고른 값(app_settings.trend_analysis_llm)을 따른다.
// 카테고리 분류는 항상 Gemini 그대로 둔다(이번 전환 범위는 트렌드 분석만).
const result = await runEntityPipeline({
  repository,
  ...(!skipAnalysis
    ? { analysisProvider: await createTrendAnalysisProviderFromSettings(env, repository), categoryClassifier: createCategoryClassifierFromEnv(env) }
    : {}),
  analysisLimit,
  analysisDeadline,
  autoApproveAnalyzed: autoApproveAnalyzedFromEnv(env.AUTO_APPROVE_ANALYZED),
});

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
