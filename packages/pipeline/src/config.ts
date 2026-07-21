export function autoApproveAnalyzedFromEnv(value: string | undefined) {
  if (value === undefined || value.trim() === "") return true;
  return !["0", "false", "off", "no"].includes(value.trim().toLowerCase());
}
