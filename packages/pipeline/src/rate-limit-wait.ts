/**
 * 분당 한도(RATE_LIMIT)에 걸렸을 때 기다렸다 이어갈지, 이번 실행을 끝낼지 결정한다.
 *
 * 예전엔 429를 만나면 즉시 중단해서, 분당 한도가 촘촘한 프로바이더에서는 실행당 몇 건밖에
 * 처리하지 못했다(Groq 무료 티어는 요청 수가 아니라 분당 토큰 8,000으로 제한하는데 우리 분석
 * 프롬프트가 한 건에 ~2,800 토큰이라 분당 2~3건이 한계였다). 서버가 알려준 대기 시간만큼
 * 기다리면 같은 실행에서 계속 처리할 수 있다.
 *
 * 기준은 "이번 실행에서 얼마나 기다렸는지"가 아니라 "마감까지 얼마 남았는지"다. 처음엔 누적
 * 대기 시간에만 상한을 뒀는데, 그러면 대기를 시작하기 전에 이미 흘러간 시간을 계산에 넣지 못한다.
 * 실제로 엔티티 처리에 7분을 쓴 뒤 8분을 더 기다려 잡 타임아웃(15분)에 걸려 강제 종료됐고,
 * 그 바람에 분석 22건을 저장해두고도 자동 승인이 실행되지 않아 아무것도 공개되지 않았다
 * (표시명 정정·검증 단계도 함께 건너뛰었다). 남은 시간으로 판단하면 이런 초과가 생기지 않는다.
 */
export const DEFAULT_MAX_SINGLE_WAIT_MS = 45_000;

export function planRateLimitWait(params: {
  /** 프로바이더가 알려준 대기 시간(ms). 모르면 undefined. */
  retryAfterMs: number | undefined;
  /** 분석 마감까지 남은 시간(ms). */
  remainingMs: number;
  maxSingleWaitMs?: number;
}): { waitMs: number } | null {
  const maxSingle = params.maxSingleWaitMs ?? DEFAULT_MAX_SINGLE_WAIT_MS;

  // 대기 시간을 모르면 얼마나 기다려야 하는지 알 수 없어 추측하지 않는다.
  if (params.retryAfterMs === undefined || !Number.isFinite(params.retryAfterMs)) return null;
  // 서버 안내가 한 번에 기다릴 상한보다 길면(예: 일일 한도 소진) 이번 실행에서 회복 불가로 본다.
  if (params.retryAfterMs > maxSingle) return null;

  // 안내된 시간에 1초를 더해 경계에서 다시 걸리는 것을 막는다.
  const waitMs = Math.max(0, Math.ceil(params.retryAfterMs)) + 1_000;
  // 기다리고 나면 분석할 시간이 남지 않는 경우엔 지금 멈춘다. 그래야 자동 승인이 실행된다.
  if (waitMs >= params.remainingMs) return null;
  return { waitMs };
}
