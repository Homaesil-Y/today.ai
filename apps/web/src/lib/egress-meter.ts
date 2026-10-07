import "server-only";

import { meterRun } from "./egress-meter-core";
import { createAdminClient } from "./supabase/admin";

let warnedMissing = false;

/**
 * 데이터 로더 하나의 Supabase 전송량을 재서 egress_meter_daily 에 더한다(출처 이름: web:<label>).
 *
 * 기록은 캐시 미스 때만 일어나고(로더가 unstable_cache 안에서 돈다), 응답 본문이 없는 RPC 1건이다.
 * 1.5초 안에 끝나지 않으면 포기한다. 마이그레이션(202610070001_egress_meter.sql) 전에는 실패하므로
 * 인스턴스당 한 번만 경고를 남긴다.
 */
export function withEgressMeter<T>(label: string, run: (fetchImpl: typeof fetch) => Promise<T>): Promise<T> {
  return meterRun(label, run, async (source, tally, day) => {
    const { error } = await createAdminClient()
      .rpc("record_egress", { p_day: day, p_source: source, p_requests: tally.requests, p_bytes: Math.round(tally.bytes) })
      .abortSignal(AbortSignal.timeout(1_500));
    if (error && !warnedMissing) {
      warnedMissing = true;
      console.warn(`[egress-meter] 전송량 기록 실패(${source}): ${error.message}`);
    }
  });
}
