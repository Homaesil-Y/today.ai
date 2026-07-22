export function autoApproveAnalyzedFromEnv(value: string | undefined) {
  if (value === undefined || value.trim() === "") return true;
  return !["0", "false", "off", "no"].includes(value.trim().toLowerCase());
}

export function analysisLimitFromEnv(value: string | undefined) {
  if (value === undefined || value.trim() === "") return 50;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 50;
  return Math.min(100, Math.max(0, Math.floor(parsed)));
}
