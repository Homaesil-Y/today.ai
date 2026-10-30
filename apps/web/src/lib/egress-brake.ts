import "server-only";

import { unstable_cache } from "next/cache";
import { cache } from "react";
import { brakeFor, evaluateEgressBudget, type EgressBrake, parseBillingCycleDay } from "@ai-trend-radar/types/egress";
import { cacheBucket } from "./cache-bucket";
import { withEgressMeter } from "./egress-meter";
import { createAdminClient } from "./supabase/admin";

/**
 * 사이트 쪽 자동 브레이크. 규칙은 packages/types/src/egress.ts 의 EGRESS_BRAKES.
 *
 * Supabase 전송량이 경고·위험 단계면 공개 데이터 캐시 주기를 늘린다(목록 갱신이 사이트 전송량의 대부분).
 * 단계는 30분마다 한 번 계량 기록(egress_meter_daily)을 읽어 정한다 — 그 읽기는 수 KB 다. 기록을 읽지
 * 못하면(테이블 없음·키 없음·오류) 브레이크를 걸지 않는다. 데이터가 덜 자주 바뀔 뿐 사이트는 계속 뜬다.
 */
const BRAKE_CHECK_SECONDS = 1_800;

const loadBrake = unstable_cache(async (_bucket: number): Promise<EgressBrake> => {
  try {
    const now = new Date();
    const cycleDay = parseBillingCycleDay(process.env.SUPABASE_BILLING_CYCLE_DAY);
    const since = new Date(now.getTime() - 40 * 86_400_000).toISOString().slice(0, 10);
    const { data, error } = await withEgressMeter("brake", async (fetchImpl) => await createAdminClient({ fetch: fetchImpl })
      .from("egress_meter_daily")
      .select("day, bytes")
      .gte("day", since)
      .limit(2000));
    if (error || !data) return brakeFor("ok");
    const days = data.map((row) => ({ day: String(row.day), bytes: Number(row.bytes) || 0 }));
    return brakeFor(evaluateEgressBudget({ days, now, cycleDay }).level);
  } catch {
    return brakeFor("ok");
  }
}, ["egress-brake"], { revalidate: BRAKE_CHECK_SECONDS });

export const getEgressBrake = cache((): Promise<EgressBrake> => loadBrake(cacheBucket(BRAKE_CHECK_SECONDS)));

/** 기본 캐시 주기(초)에 브레이크 배수를 곱한 실제 주기. */
export async function brakedSeconds(baseSeconds: number): Promise<number> {
  return baseSeconds * (await getEgressBrake()).siteCacheMultiplier;
}
