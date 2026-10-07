import { afterEach, describe, expect, it, vi } from "vitest";
import { EGRESS_RESPONSE_OVERHEAD_BYTES } from "@ai-trend-radar/types/egress";
import { meterRun } from "./egress-meter-core";

/** 사이트 쪽 Supabase 전송량 계량. 배경은 packages/types/src/egress.ts(2026-10-06 egress 한도 초과 차단). */
afterEach(() => vi.unstubAllGlobals());

const fixedNow = () => new Date("2026-10-07T05:00:00Z");

describe("로더 단위 계량", () => {
  it("로더가 받은 응답을 합쳐 한 번에 기록한다", async () => {
    vi.stubGlobal("fetch", async () => new Response("[1,2,3]"));
    const flush = vi.fn(async () => {});

    const result = await meterRun("trends-list", async (fetchImpl) => {
      await (await fetchImpl("https://x.supabase.co/rest/v1/entities")).text();
      await (await fetchImpl("https://x.supabase.co/rest/v1/trend_scores")).text();
      return "ok";
    }, flush, fixedNow);

    expect(result).toBe("ok");
    expect(flush).toHaveBeenCalledTimes(1);
    expect(flush).toHaveBeenCalledWith("web:trends-list", { requests: 2, bytes: 2 * (7 + EGRESS_RESPONSE_OVERHEAD_BYTES) }, "2026-10-07");
  });

  it("로더가 실패해도 그때까지 받은 양은 기록하고 오류는 그대로 던진다", async () => {
    vi.stubGlobal("fetch", async () => new Response("{}"));
    const flush = vi.fn(async () => {});

    await expect(meterRun("news", async (fetchImpl) => {
      await (await fetchImpl("https://x.supabase.co/rest/v1/news_items")).text();
      throw new Error("파싱 실패");
    }, flush, fixedNow)).rejects.toThrow("파싱 실패");

    expect(flush).toHaveBeenCalledWith("web:news", { requests: 1, bytes: 2 + EGRESS_RESPONSE_OVERHEAD_BYTES }, "2026-10-07");
  });

  it("기록이 실패해도 페이지 데이터는 그대로 돌려준다", async () => {
    vi.stubGlobal("fetch", async () => new Response("[]"));
    const result = await meterRun("reports", async (fetchImpl) => {
      await (await fetchImpl("https://x.supabase.co/rest/v1/reports")).text();
      return [1];
    }, async () => { throw new Error("egress_meter_daily 없음"); }, fixedNow);

    expect(result).toEqual([1]);
  });

  it("요청이 없었으면 기록하지 않는다", async () => {
    const flush = vi.fn(async () => {});
    await meterRun("trend-detail", async () => [], flush, fixedNow);
    expect(flush).not.toHaveBeenCalled();
  });
});
