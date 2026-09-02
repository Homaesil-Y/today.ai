/**
 * 점수 척도를 바꾼 뒤(scoring_version 상향) 직전 날짜의 스냅샷을 새 척도로 한 번 채워 넣는다.
 *
 * 왜 필요한가: loadScoreHistory 는 같은 scoring_version 끼리만 비교한다. 버전을 올린 첫날은
 * 비교 대상이 없어 전 엔티티가 WATCH 로 표시된다 — 화면의 상태 배지가 전부 "관찰 대상"이 되어
 * 고장처럼 보인다. 직전 날짜 스냅샷을 새 척도로 한 번 만들어 두면 그날부터 상태가 정상 동작한다.
 *
 * 무엇을 쓰는가: trend_scores 에 (score_date=대상일, scoring_version=현재 버전) 행만 추가한다.
 * 기존 버전의 행은 충돌 키에 scoring_version 이 들어 있어 건드리지 않는다. entities.status 도
 * 손대지 않는다 — 그건 오늘자 실행이 정하는 값이다.
 *
 * 정확도: 대상 시점까지 **게시된**(published_at) 원본으로 재구성한다. collected_at 으로 걸렀을 때는
 * 그 뒤 재수집된 항목이 빠졌는데, 재수집되는 항목이 곧 가장 뜨거운 항목이라 순위 최상위가 첫날
 * WATCH 로 남았다(2026-09-02 실측: 상위 10 중 6건). published_at 은 바뀌지 않으므로 재수집과
 * 무관하게 "그날 존재했던 항목"을 고른다. 지표는 현재 값을 쓰고 감쇠는 기준 시각으로 계산하므로
 * 여전히 근사지만, 상태 판정의 "직전 신호" 한 번에만 쓰이는 값이라 충분하다.
 *
 * 실행:
 *   pnpm --filter @ai-trend-radar/pipeline exec tsx src/cli/backfill-score-history.ts            # dry-run
 *   pnpm --filter @ai-trend-radar/pipeline exec tsx src/cli/backfill-score-history.ts --write
 *   ... --date=2026-08-25   (기본값: 오늘 UTC 기준 하루 전)
 */
import { loadWorkspaceEnvironment } from "@ai-trend-radar/collectors";
import { extractEntityCandidate } from "../candidate";
import { ScoreDistributions } from "../engagement-percentile";
import { BOOTSTRAP_SCORING_VERSION, calculateInitialTrendScore, commentValue, engagementValue } from "../initial-score";
import { chunkRows } from "../batch-write";
import { SupabasePipelineRepository } from "../repository";
import type { EntityCandidate } from "../schema";

const env = loadWorkspaceEnvironment();
const write = process.argv.includes("--write");
const dateArg = process.argv.find((arg) => arg.startsWith("--date="))?.slice("--date=".length);

const now = new Date();
const asOf = dateArg ? new Date(`${dateArg}T23:59:59.999Z`) : new Date(now.getTime() - 86_400_000);
const scoreDate = asOf.toISOString().slice(0, 10);
if (scoreDate >= now.toISOString().slice(0, 10)) {
  throw new Error(`대상 날짜(${scoreDate})는 오늘보다 앞서야 합니다 — 오늘자는 파이프라인이 씁니다.`);
}

const repository = SupabasePipelineRepository.fromEnvironment(env);
await repository.initialize();
const rawItems = await repository.loadRawItems();

// 대상 시점까지 게시된 원본만 남긴다(firstDetectedAt = published_at, 재수집돼도 바뀌지 않는다).
const candidates = rawItems
  .map(extractEntityCandidate)
  .filter((candidate): candidate is EntityCandidate => candidate !== null)
  .filter((candidate) => new Date(candidate.firstDetectedAt) <= asOf);

const distributions = new ScoreDistributions(candidates.map((candidate) => ({
  source: candidate.source,
  engagement: engagementValue(candidate),
  comments: commentValue(candidate),
})));

const grouped = new Map<string, EntityCandidate[]>();
for (const candidate of candidates) {
  const entity = repository.matchEntity(candidate);
  if (!entity) continue;
  const list = grouped.get(entity.id);
  if (list) list.push(candidate);
  else grouped.set(entity.id, [candidate]);
}

const rows = [...grouped.entries()].map(([entityId, group]) => {
  // 이력 없이 계산한다 — 이 스냅샷의 status 는 쓰이지 않고, 다음 실행의 "직전 점수"로만 읽힌다.
  const score = calculateInitialTrendScore(group, asOf, distributions);
  return {
    entity_id: entityId,
    score_date: scoreDate,
    total_score: score.totalScore,
    cross_source_score: score.breakdown.crossSource,
    velocity_score: score.breakdown.velocity,
    comments_score: score.breakdown.comments,
    product_growth_score: score.breakdown.productGrowth,
    threads_score: score.breakdown.threads,
    reddit_score: score.breakdown.reddit,
    novelty_score: score.breakdown.novelty,
    instagram_score: score.breakdown.instagram,
    quality_score: score.breakdown.quality,
    trust_score: score.trustScore,
    status: score.status,
    ranked: score.ranked,
    scoring_version: score.scoringVersion,
    // 재구성 시점으로 기록한다. 지금 시각을 넣으면 웹이 이 행을 "최신 스냅샷"으로 골라
    // 어제 점수를 현재 점수로 보여준다(latestByEntity 가 calculated_at 내림차순의 첫 행을 쓴다).
    calculated_at: asOf.toISOString(),
  };
});

const values = rows.map((row) => row.total_score).sort((a, b) => b - a);
const quantile = (p: number) => values[Math.floor((values.length - 1) * p)] ?? 0;
console.log(JSON.stringify({
  mode: write ? "write" : "dry-run",
  scoreDate,
  asOf: asOf.toISOString(),
  scoringVersion: BOOTSTRAP_SCORING_VERSION,
  candidatesUsed: candidates.length,
  entities: rows.length,
  ranked: rows.filter((row) => row.ranked).length,
  scoreMax: quantile(0), scoreMedian: quantile(0.5),
}, null, 2));

if (!write) {
  console.log("dry-run 입니다. 실제로 쓰려면 --write 를 붙이세요.");
} else {
  let written = 0;
  for (const chunk of chunkRows(rows)) {
    const { error } = await repository.upsertScoreSnapshots(chunk);
    if (error) throw new Error(`백필 실패: ${error}`);
    written += chunk.length;
  }
  console.log(`${written}행을 기록했습니다.`);
}
