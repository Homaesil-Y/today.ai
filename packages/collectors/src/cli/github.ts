import { GitHubCollector } from "../github";

const mode = process.env.COLLECTOR_MODE === "live" ? "live" : "fixture";
const token = process.env.GITHUB_TOKEN;
const result = await new GitHubCollector().collect(
  token ? { token } : {},
  { now: new Date(), mode },
);

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
