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

/** 잡 타임아웃(15분)보다 넉넉히 짧게 잡아 자동 승인·표시명 정정·검증 단계가 실행될 시간을 남긴다. */
export const DEFAULT_ANALYSIS_BUDGET_MINUTES = 10;

/**
 * 프로세스 시작부터 분석을 계속할 수 있는 시간(분). 이 시간이 지나면 남은 후보는 다음 주기로 넘긴다.
 *
 * 프로바이더가 느릴 때(Groq 무료 티어는 분당 2~3건) 분석만 하다가 잡 타임아웃에 걸려 프로세스가
 * 강제 종료되면, 이미 저장한 분석이 공개되지 못한다. 실측으로 그렇게 22건이 묻혔다.
 */
export function analysisBudgetMinutesFromEnv(value: string | undefined) {
  if (value === undefined || value.trim() === "") return DEFAULT_ANALYSIS_BUDGET_MINUTES;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_ANALYSIS_BUDGET_MINUTES;
  return Math.min(60, parsed);
}
