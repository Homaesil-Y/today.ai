import { loadWorkspaceEnvironment } from "@ai-trend-radar/collectors";
import { createCategoryClassifierFromEnv, createGeminiProviderFromEnv } from "@ai-trend-radar/llm";
import { analysisLimitFromEnv, autoApproveAnalyzedFromEnv } from "../config";
import { SupabasePipelineRepository } from "../repository";
import { runEntityPipeline } from "../runner";

const env = loadWorkspaceEnvironment();
const skipAnalysis = process.argv.includes("--skip-analysis");
const analysisLimit = analysisLimitFromEnv(env.GEMINI_ANALYSIS_LIMIT);
const repository = SupabasePipelineRepository.fromEnvironment(env);
const result = await runEntityPipeline({
  repository,
  // 분석과 카테고리 분류는 같은 Gemini 자격으로 동작. 분석을 켤 때만 분류기도 붙여
  // 분석된 엔티티를 배치 1콜로 재분류한다(엔티티당 추가 호출 없음).
  ...(!skipAnalysis ? { analysisProvider: createGeminiProviderFromEnv(env), categoryClassifier: createCategoryClassifierFromEnv(env) } : {}),
  analysisLimit,
  autoApproveAnalyzed: autoApproveAnalyzedFromEnv(env.AUTO_APPROVE_ANALYZED),
});

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
