/**
 * 점수 공식 변경을 배포 전에 검증하는 분석 도구. DB에는 아무것도 쓰지 않는다.
 *
 * 실제 공식(calculateInitialTrendScore)을 두 시점(지금, 24시간 전)에 대해 재생해 하루 변화를
 * 재현한다. "24시간 전"은 그 시점까지 수집된 항목만으로 구성한다 — 재수집된 항목은 collected_at
 * 이 갱신되어 과거 시점에서 빠지므로 상승(RISING) 쪽은 하한으로 읽어야 한다.
 *
 * 실행: pnpm --filter @ai-trend-radar/pipeline exec tsx src/cli/simulate-decay.ts
 */
import { loadWorkspaceEnvironment } from "@ai-trend-radar/collectors";
import { calculateStatus, engagementSignal } from "@ai-trend-radar/scoring";
import { extractEntityCandidate } from "../candidate";
import { ScoreDistributions } from "../engagement-percentile";
import { calculateInitialTrendScore, commentValue, engagementValue } from "../initial-score";
import { SupabasePipelineRepository } from "../repository";
import type { EntityCandidate } from "../schema";

const env = loadWorkspaceEnvironment();
const repository = SupabasePipelineRepository.fromEnvironment(env);
await repository.initialize();
const rawItems = await repository.loadRawItems();
const candidates = rawItems.map(extractEntityCandidate).filter((c): c is EntityCandidate => c !== null);

function scoreAt(at: Date) {
  // 게시 시각(불변) 기준으로 "그 시점에 존재했던 항목"을 고른다. collected_at 으로 거르면 재수집된
  // (= 가장 뜨거운) 항목이 과거 시점에서 빠져 상승·정점이 과소평가된다(backfill-score-history.ts 참고).
  const usable = candidates.filter((c) => new Date(c.firstDetectedAt) <= at);
  const distributions = new ScoreDistributions(usable.map((c) => ({ source: c.source, engagement: engagementValue(c), comments: commentValue(c) })));
  const grouped = new Map<string, EntityCandidate[]>();
  for (const c of usable) {
    const entity = repository.matchEntity(c);
    if (!entity) continue;
    const list = grouped.get(entity.id);
    if (list) list.push(c); else grouped.set(entity.id, [c]);
  }
  const scores = new Map<string, { total: number; signal: number; ageHours: number }>();
  for (const [id, cands] of grouped) {
    const result = calculateInitialTrendScore(cands, at, distributions);
    const firstDetected = Math.min(...cands.map((c) => new Date(c.firstDetectedAt).getTime()));
    scores.set(id, {
      total: result.totalScore,
      signal: engagementSignal(result.breakdown),
      ageHours: Math.max(0, (at.getTime() - firstDetected) / 3_600_000),
    });
  }
  return scores;
}

const now = new Date();
const today = scoreAt(now);
const prior = scoreAt(new Date(now.getTime() - 86_400_000));

const statusCounts: Record<string, number> = {};
const deltas: number[] = [];
for (const [id, s] of today) {
  const prev = prior.get(id);
  // 상태는 총점이 아니라 반응 신호의 변화로 판정한다(scoring 의 engagementSignal 참고).
  const status = calculateStatus({
    firstDetectedHours: s.ageHours,
    signal: s.signal,
    previousSignal: prev?.signal ?? s.signal,
    dataPoints: prev ? 2 : 1,
  });
  statusCounts[status] = (statusCounts[status] ?? 0) + 1;
  if (prev) deltas.push(s.total - prev.total);
}

const top = (m: Map<string, { total: number }>) =>
  [...m.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 50).map(([id]) => id);
const priorTop = new Set(top(prior));
const churn = top(today).filter((id) => !priorTop.has(id)).length;
const sortedValues = [...today.values()].map((s) => s.total).sort((a, b) => b - a);
const q = (p: number) => sortedValues[Math.floor((sortedValues.length - 1) * p)] ?? 0;

console.log(JSON.stringify({
  entities: today.size,
  scoreMax: q(0), scoreMedian: q(0.5),
  top50Churn: churn,
  dayDeltaGte2: deltas.filter((d) => d >= 2).length,
  dayDeltaLteMinus2: deltas.filter((d) => d <= -2).length,
  statusCounts,
}, null, 2));
