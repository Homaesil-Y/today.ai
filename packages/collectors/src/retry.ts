export async function withRetry<T>(
  operation: () => Promise<T>,
  options: {
    attempts?: number;
    baseDelayMs?: number;
    signal?: AbortSignal;
    /**
     * 이 오류를 다시 시도할지 판단한다. 기본값은 전부 재시도(기존 동작).
     * 설정 누락이나 인증 실패처럼 결과가 바뀌지 않는 오류는 false 를 돌려 즉시 포기하면
     * 같은 실패를 기다리며 반복하지 않는다.
     */
    shouldRetry?: (error: unknown) => boolean;
    /**
     * 서버가 "이만큼 뒤에 다시 오라"고 알려준 경우 그 값을 돌려준다(ms). null 이면 지수 백오프를 쓴다.
     *
     * 429 응답의 Retry-After 를 무시하고 고정 백오프로 재시도하면 같은 429 를 다시 받는다.
     * 서버가 지시한 시간이 백오프보다 길면 그쪽을 따른다.
     */
    retryAfterMs?: (error: unknown) => number | null;
    /** retryAfterMs 가 이 값을 넘으면 기다리지 않고 포기한다(기본 60초). */
    maxDelayMs?: number;
  } = {},
): Promise<T> {
  const attempts = options.attempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 250;
  const maxDelayMs = options.maxDelayMs ?? 60_000;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (options.shouldRetry && !options.shouldRetry(error)) break;
      if (attempt === attempts || options.signal?.aborted) break;
      const backoff = baseDelayMs * 2 ** (attempt - 1);
      const advised = options.retryAfterMs?.(error) ?? null;
      const delay = advised === null ? backoff : Math.max(backoff, advised);
      // 서버가 터무니없이 긴 대기를 요구하면 이번 주기는 포기한다 — 다음 실행에서 다시 시도한다.
      if (delay > maxDelayMs) break;
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, delay);
        options.signal?.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            reject(new DOMException("Collection aborted", "AbortError"));
          },
          { once: true },
        );
      });
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Collector failed");
}
