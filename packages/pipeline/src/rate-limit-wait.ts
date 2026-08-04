/**
 * 분당 한도(RATE_LIMIT)에 걸렸을 때 기다렸다 이어갈지, 이번 실행을 끝낼지 결정한다.
 *
 * 예전엔 429를 만나면 즉시 중단해서, 분당 한도가 촘촘한 프로바이더에서는 실행당 몇 건밖에
 * 처리하지 못했다(Groq 무료 티어는 요청 수가 아니라 분당 토큰 8,000으로 제한하는데 우리 분석
 * 프롬프트가 한 건에 ~2,800 토큰이라 분당 2~3건이 한계였다). 서버가 알려준 대기 시간만큼
 * 기다리면 같은 실행에서 계속 처리할 수 있다.
 *
 * 다만 GitHub Actions 잡에 15분 타임아웃이 걸려 있어 무한정 기다릴 수는 없다. 그래서
 * (1) 한 번에 기다리는 시간, (2) 실행 전체에서 기다린 누적 시간 둘 다에 상한을 둔다.
 * 상한을 넘거나 서버가 대기 시간을 알려주지 않으면 이번 실행을 마무리하고 다음 주기에 맡긴다.
 */
export const DEFAULT_MAX_SINGLE_WAIT_MS = 45_000;
export const DEFAULT_MAX_TOTAL_WAIT_MS = 8 * 60_000;

export function planRateLimitWait(params: {
  /** 프로바이더가 알려준 대기 시간(ms). 모르면 undefined. */
  retryAfterMs: number | undefined;
  /** 이번 실행에서 이미 기다린 누적 시간(ms). */
  waitedMs: number;
  maxSingleWaitMs?: number;
  maxTotalWaitMs?: number;
}): { waitMs: number } | null {
  const maxSingle = params.maxSingleWaitMs ?? DEFAULT_MAX_SINGLE_WAIT_MS;
  const maxTotal = params.maxTotalWaitMs ?? DEFAULT_MAX_TOTAL_WAIT_MS;

  // 대기 시간을 모르면 얼마나 기다려야 하는지 알 수 없어 추측하지 않는다.
  if (params.retryAfterMs === undefined || !Number.isFinite(params.retryAfterMs)) return null;
  // 서버 안내가 한 번에 기다릴 상한보다 길면(예: 일일 한도 소진) 이번 실행에서 회복 불가로 본다.
  if (params.retryAfterMs > maxSingle) return null;

  // 안내된 시간에 1초를 더해 경계에서 다시 걸리는 것을 막는다.
  const waitMs = Math.max(0, Math.ceil(params.retryAfterMs)) + 1_000;
  if (params.waitedMs + waitMs > maxTotal) return null;
  return { waitMs };
}
