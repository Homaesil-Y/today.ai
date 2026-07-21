import type {
  Collector,
  CollectorContext,
  CollectorResult,
  RawItem,
} from "@ai-trend-radar/types";
import { canonicalizeUrl } from "@ai-trend-radar/scoring";
import { z } from "zod";
import fixture from "../fixtures/github-search.json" with { type: "json" };
import { withRetry } from "./retry";

const githubRepositorySchema = z.object({
  id: z.number(),
  full_name: z.string(),
  html_url: z.url(),
  description: z.string().nullable(),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
  stargazers_count: z.number().nonnegative(),
  forks_count: z.number().nonnegative(),
  open_issues_count: z.number().nonnegative(),
  language: z.string().nullable(),
  topics: z.array(z.string()).default([]),
  homepage: z.string().nullable(),
  owner: z.object({ login: z.string() }),
  license: z.object({ spdx_id: z.string().nullable() }).nullable(),
});

const githubSearchSchema = z.object({
  total_count: z.number(),
  items: z.array(githubRepositorySchema),
});

export type GitHubRepositoryPayload = z.infer<typeof githubRepositorySchema>;

export interface GitHubCollectorConfig {
  token?: string;
  query?: string;
  perPage?: number;
  fetcher?: typeof fetch;
}

export class GitHubCollector
  implements Collector<GitHubCollectorConfig, GitHubRepositoryPayload>
{
  readonly source = "github" as const;

  async collect(
    config: GitHubCollectorConfig,
    context: CollectorContext,
  ): Promise<CollectorResult<GitHubRepositoryPayload>> {
    const startedAt = context.now.toISOString();
    const liveResult = context.mode === "fixture" ? null : await this.fetchLive(config, context);
    const payload = liveResult?.payload ?? githubSearchSchema.parse(fixture);
    const collectedAt = context.now.toISOString();
    const items = payload.items.map<RawItem<GitHubRepositoryPayload>>((repo) => ({
      source: "github",
      sourceItemId: String(repo.id),
      title: repo.full_name,
      body: repo.description,
      url: repo.html_url,
      canonicalUrl: canonicalizeUrl(repo.homepage || repo.html_url),
      authorName: repo.owner.login,
      publishedAt: repo.created_at,
      collectedAt,
      metrics: {
        stars: repo.stargazers_count,
        forks: repo.forks_count,
        issues: repo.open_issues_count,
      },
      rawPayload: repo,
    }));

    return {
      source: this.source,
      startedAt,
      finishedAt: new Date(context.now.getTime() + 1).toISOString(),
      items,
      warnings:
        context.mode === "fixture"
          ? ["Fixture mode: live GitHub rate-limit data is unavailable."]
          : [],
      ...(liveResult?.rateLimit ? { rateLimit: liveResult.rateLimit } : {}),
    };
  }

  private async fetchLive(
    config: GitHubCollectorConfig,
    context: CollectorContext,
  ) {
    const fetcher = config.fetcher ?? fetch;
    const query = config.query ?? "topic:artificial-intelligence created:>2026-01-01";
    const url = new URL("https://api.github.com/search/repositories");
    url.searchParams.set("q", query);
    url.searchParams.set("sort", "stars");
    url.searchParams.set("order", "desc");
    url.searchParams.set("per_page", String(config.perPage ?? 30));

    return withRetry(async () => {
      const response = await fetcher(url, {
        headers: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}),
        },
        ...(context.signal ? { signal: context.signal } : {}),
      });
      if (!response.ok) {
        throw new Error(`GitHub collector failed with HTTP ${response.status}`);
      }
      const remaining = Number(response.headers.get("x-ratelimit-remaining"));
      const resetSeconds = Number(response.headers.get("x-ratelimit-reset"));
      return {
        payload: githubSearchSchema.parse(await response.json()),
        rateLimit: {
          remaining: Number.isFinite(remaining) ? remaining : null,
          resetAt: Number.isFinite(resetSeconds)
            ? new Date(resetSeconds * 1_000).toISOString()
            : null,
        },
      };
    }, context.signal ? { signal: context.signal } : {});
  }
}
