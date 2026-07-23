import { loadWorkspaceEnvironment } from "@ai-trend-radar/collectors";
import { createNewsSummarizerFromEnv } from "@ai-trend-radar/llm";
import { NewsRepository } from "../news-repository";
import { runNewsPipeline } from "../news-runner";

const env = loadWorkspaceEnvironment();
const dryRun = process.argv.includes("--dry");

const summarizer = createNewsSummarizerFromEnv(env);
const repository = dryRun ? undefined : NewsRepository.fromEnvironment(env);

const result = await runNewsPipeline({ summarizer, now: new Date(), dryRun, ...(repository ? { repository } : {}) });
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
