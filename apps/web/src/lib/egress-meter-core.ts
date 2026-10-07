import { brotliCompressSync, constants as zlibConstants, deflateSync, gzipSync } from "node:zlib";
import { createMeteredFetch, type EgressTally } from "@ai-trend-radar/types/egress";

/**
 * 사이트(Vercel)의 Supabase 전송량 계량 — 순수 로직. 서버 전용 기록은 egress-meter.ts.
 *
 * 캐시 미스 때 실행되는 데이터 로더 하나를 단위로 잰다. 큰 전송(목록 갱신·상세·뉴스·리포트)은 전부
 * 이런 로더에서 나온다. 로더가 끝나면 합계를 public.egress_meter_daily 에 더한다(배경은
 * packages/types/src/egress.ts). 로그인·관심 목록처럼 사용자별로 작은 요청은 계량하지 않는다.
 */
export function estimateCompressedBytes(body: Uint8Array, encoding: string): number {
  if (body.byteLength === 0) return 0;
  if (encoding.includes("br")) {
    return brotliCompressSync(body, { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 5 } }).byteLength;
  }
  if (encoding.includes("deflate")) return deflateSync(body).byteLength;
  return gzipSync(body).byteLength;
}

export type EgressFlush = (source: string, tally: EgressTally, day: string) => Promise<void>;

/**
 * run 이 쓰는 Supabase 요청을 계량하고, 끝나면(실패해도) flush 로 넘긴다.
 * flush 실패는 삼킨다 — 계량 때문에 페이지가 깨지면 안 된다.
 */
export async function meterRun<T>(
  label: string,
  run: (fetchImpl: typeof fetch) => Promise<T>,
  flush: EgressFlush,
  now: () => Date = () => new Date(),
): Promise<T> {
  const tally: EgressTally = { requests: 0, bytes: 0 };
  const fetchImpl = createMeteredFetch({
    fetch: (input, init) => fetch(input, init),
    record: (bytes) => {
      tally.requests += 1;
      tally.bytes += bytes;
    },
    estimateCompressed: estimateCompressedBytes,
  });
  try {
    return await run(fetchImpl);
  } finally {
    if (tally.requests > 0) {
      try {
        await flush(`web:${label}`, tally, now().toISOString().slice(0, 10));
      } catch {
        // 기록 실패는 무시한다.
      }
    }
  }
}
