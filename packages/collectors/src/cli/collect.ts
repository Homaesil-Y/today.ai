import type { CollectorResult, SourceCode } from "@ai-trend-radar/types";
import { loadWorkspaceEnvironment } from "../environment";
import { GitHubCollector } from "../github";
import { HackerNewsCollector } from "../hacker-news";
import { ProductHuntCollector } from "../product-hunt";
import { SupabaseCollectorStore } from "../supabase-store";

const env = loadWorkspaceEnvironment();
const live = process.argv.includes("--live") || env.COLLECTOR_MODE === "live";
const noStore = process.argv.includes("--no-store");
const mode = live ? "live" as const : "fixture" as const;
const store = noStore ? null : SupabaseCollectorStore.fromEnvironment(env);

const jobs: Array<{
  source: SourceCode;
  collect: () => Promise<CollectorResult>;
}> = [
  {
    source: "github",
    collect: () => new GitHubCollector().collect({
      ...(env.GITHUB_TOKEN ? { token: env.GITHUB_TOKEN } : {}),
      ...(env.GITHUB_SEARCH_QUERY ? { query: env.GITHUB_SEARCH_QUERY } : {}),
      perPage: 30,
    }, { now: new Date(), mode }),
  },
  {
    source: "hacker_news",
    collect: () => new HackerNewsCollector().collect({
      ...(env.HN_SEARCH_QUERY ? { query: env.HN_SEARCH_QUERY } : {}),
      hitsPerPage: 50,
    }, { now: new Date(), mode }),
  },
  {
    source: "product_hunt",
    collect: () => new ProductHuntCollector().collect({
      ...(env.PRODUCT_HUNT_TOKEN ? { token: env.PRODUCT_HUNT_TOKEN } : {}),
      first: 20,
      maxPages: 3,
      postedAfterDays: 7,
    }, { now: new Date(), mode }),
  },
];

const summaries: Array<Record<string, unknown>> = [];
let failed = false;

for (const job of jobs) {
  const startedAt = new Date().toISOString();
  try {
    const result = await job.collect();
    const persistence = store ? await store.persistResult(result) : null;
    summaries.push({
      source: result.source,
      mode,
      fetchedCount: result.items.length,
      stored: Boolean(store),
      ...(persistence ?? {}),
      warnings: result.warnings,
      rateLimitRemaining: result.rateLimit?.remaining ?? null,
    });
  } catch (error) {
    failed = true;
    const message = error instanceof Error ? error.message : "Unknown collector failure";
    if (store) {
      try {
        await store.persistFailure(job.source, startedAt, error);
      } catch (storageError) {
        const storageMessage = storageError instanceof Error ? storageError.message : "Unknown storage failure";
        summaries.push({ source: job.source, mode, error: message, storageError: storageMessage });
        continue;
      }
    }
    summaries.push({ source: job.source, mode, error: message });
  }
}

process.stdout.write(`${JSON.stringify({ mode, stored: Boolean(store), results: summaries }, null, 2)}\n`);
if (failed) process.exitCode = 1;
