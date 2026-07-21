export async function withRetry<T>(
  operation: () => Promise<T>,
  options: { attempts?: number; baseDelayMs?: number; signal?: AbortSignal } = {},
): Promise<T> {
  const attempts = options.attempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 250;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
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
