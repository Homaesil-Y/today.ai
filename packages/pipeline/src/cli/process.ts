import { loadWorkspaceEnvironment } from "@ai-trend-radar/collectors";
import { createGeminiProviderFromEnv } from "@ai-trend-radar/llm";
import { autoApproveAnalyzedFromEnv } from "../config";
import { SupabasePipelineRepository } from "../repository";
import { runEntityPipeline } from "../runner";

const env = loadWorkspaceEnvironment();
const skipAnalysis = process.argv.includes("--skip-analysis");
const analysisLimit = Number(env.GEMINI_ANALYSIS_LIMIT ?? "3");
const repository = SupabasePipelineRepository.fromEnvironment(env);
const result = await runEntityPipeline({
  repository,
  ...(!skipAnalysis ? { analysisProvider: createGeminiProviderFromEnv(env) } : {}),
  analysisLimit: Number.isFinite(analysisLimit) ? analysisLimit : 3,
  autoApproveAnalyzed: autoApproveAnalyzedFromEnv(env.AUTO_APPROVE_ANALYZED),
});

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
