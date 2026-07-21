export async function selectPendingAnalyses<T>(
  candidates: T[],
  limit: number,
  hasRecentAnalysis: (candidate: T) => Promise<boolean>,
) {
  const pending: T[] = [];
  let skipped = 0;

  for (const candidate of candidates) {
    if (pending.length >= Math.max(0, limit)) break;
    if (await hasRecentAnalysis(candidate)) {
      skipped += 1;
      continue;
    }
    pending.push(candidate);
  }

  return { pending, skipped };
}
