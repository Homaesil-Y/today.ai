import { loadWorkspaceEnvironment } from "@ai-trend-radar/collectors";
import { extractEntityCandidate } from "../candidate";
import { SupabasePipelineRepository } from "../repository";

const env = loadWorkspaceEnvironment();
const repository = SupabasePipelineRepository.fromEnvironment(env);
await repository.initialize();
const rawItems = await repository.loadRawItems();
const candidates = rawItems.map(extractEntityCandidate).filter((candidate) => candidate !== null);

const bySource = Object.fromEntries(
  ["github", "hacker_news"].map((source) => [source, candidates.filter((candidate) => candidate.source === source).length]),
);

process.stdout.write(`${JSON.stringify({
  rawItemsRead: rawItems.length,
  candidatesAccepted: candidates.length,
  candidatesRejected: rawItems.length - candidates.length,
  bySource,
  names: candidates.map(({ name, source }) => ({ name, source })),
}, null, 2)}\n`);
