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
  } = {},
): Promise<T> {
  const attempts = options.attempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 250;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (options.shouldRetry && !options.shouldRetry(error)) break;
      if (attempt === attempts || options.signal?.aborted) break;
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, baseDelayMs * 2 ** (attempt - 1));
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
