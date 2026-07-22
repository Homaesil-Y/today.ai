import { loadWorkspaceEnvironment } from "@ai-trend-radar/collectors";
import { createGeminiProviderFromEnv } from "@ai-trend-radar/llm";
import { analysisLimitFromEnv, autoApproveAnalyzedFromEnv } from "../config";
import { SupabasePipelineRepository } from "../repository";
import { runEntityPipeline } from "../runner";

const env = loadWorkspaceEnvironment();
const skipAnalysis = process.argv.includes("--skip-analysis");
const analysisLimit = analysisLimitFromEnv(env.GEMINI_ANALYSIS_LIMIT);
const repository = SupabasePipelineRepository.fromEnvironment(env);
const result = await runEntityPipeline({
  repository,
  ...(!skipAnalysis ? { analysisProvider: createGeminiProviderFromEnv(env) } : {}),
  analysisLimit,
  autoApproveAnalyzed: autoApproveAnalyzedFromEnv(env.AUTO_APPROVE_ANALYZED),
});

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
