import type { CollectorResult, SourceCode } from "@ai-trend-radar/types";
import { loadWorkspaceEnvironment } from "../environment";
import { GitHubCollector } from "../github";
import { HackerNewsCollector } from "../hacker-news";
import { ProductHuntCollector } from "../product-hunt";
import { RedditCollector } from "../reddit";
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
  {
    source: "reddit",
    collect: () => new RedditCollector().collect({
      ...(env.REDDIT_CLIENT_ID ? { clientId: env.REDDIT_CLIENT_ID } : {}),
      ...(env.REDDIT_CLIENT_SECRET ? { clientSecret: env.REDDIT_CLIENT_SECRET } : {}),
      ...(env.HN_SEARCH_QUERY ? { query: env.HN_SEARCH_QUERY } : {}),
      limit: 50,
      maxPages: 2,
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

/**
 * 채널 하나가 실패해도 나머지가 수집됐으면 성공으로 끝낸다.
 *
 * 예전엔 채널 하나라도 실패하면 exitCode 1 이었다. 2026-09-12·13 실행 2건이 그렇게 죽었는데,
 * 로그를 보면 GitHub 저장만 504 로 실패하고 Hacker News·Product Hunt 는 수집·저장까지 정상
 * 완료한 상태였다. 그런데도 수집 단계가 실패로 끝나 뒤따르는 점수 계산·표시명 정정·리포트·검증이
 * 전부 건너뛰어졌다 — 데이터는 들어왔는데 그 데이터를 쓰는 단계가 통째로 사라진 셈이다.
 *
 * 채널은 서로 독립적이고 각 채널은 3시간 뒤 다음 주기에 다시 시도된다. 그래서 "하나라도
 * 성공했으면 파이프라인을 계속 진행"이 맞다. 전 채널이 실패했을 때만(= 공통 원인이 있을 때만)
 * 실행을 실패로 표시해 알림이 가게 한다.
 */
const succeededCount = summaries.filter((summary) => summary.error === undefined).length;
const failedSources = summaries.filter((summary) => summary.error !== undefined).map((summary) => summary.source);
process.stdout.write(`${JSON.stringify({
  mode,
  stored: Boolean(store),
  succeededCount,
  failedCount: failedSources.length,
  failedSources,
  results: summaries,
}, null, 2)}\n`);
if (failed && succeededCount === 0) process.exitCode = 1;
