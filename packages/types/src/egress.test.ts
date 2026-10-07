import { describe, expect, it } from "vitest";
import {
  billingCycleStart,
  createMeteredFetch,
  DAILY_EGRESS_BUDGET_BYTES,
  EGRESS_RESPONSE_OVERHEAD_BYTES,
  evaluateEgressBudget,
  formatBytes,
  nextBillingCycleStart,
  parseBillingCycleDay,
  SUPABASE_FREE_EGRESS_BYTES,
  wireBytes,
} from "./egress";

/**
 * Supabase egress 계량 규칙. 2026-10-06 egress 한도 초과로 프로젝트가 차단될 때까지 사용량을 볼
 * 장치가 없었다 — 이 규칙이 틀리면 경고가 늦거나 울리지 않는다.
 */
describe("전송 크기 추정", () => {
  it("압축 응답에 Content-Length 가 있으면 그 값을 쓴다", () => {
    expect(wireBytes({ decodedBytes: 10_000, contentLength: 2_000, contentEncoding: "gzip", estimateCompressed: () => 9_999 }))
      .toBe(2_000 + EGRESS_RESPONSE_OVERHEAD_BYTES);
  });

  it("압축 응답에 길이가 없으면 다시 압축해 잰다", () => {
    expect(wireBytes({ decodedBytes: 10_000, contentLength: null, contentEncoding: "gzip", estimateCompressed: (encoding) => (encoding === "gzip" ? 1_800 : 0) }))
      .toBe(1_800 + EGRESS_RESPONSE_OVERHEAD_BYTES);
  });

  it("압축하지 않은 응답은 본문 크기 그대로다", () => {
    expect(wireBytes({ decodedBytes: 4_321, contentLength: null, contentEncoding: null, estimateCompressed: () => 1 }))
      .toBe(4_321 + EGRESS_RESPONSE_OVERHEAD_BYTES);
  });

  it("본문 없는 응답(head 카운트)도 헤더 몫은 센다", () => {
    expect(wireBytes({ decodedBytes: 0, contentLength: 0, contentEncoding: null, estimateCompressed: () => 0 }))
      .toBe(EGRESS_RESPONSE_OVERHEAD_BYTES);
  });
});

describe("계량 fetch", () => {
  it("응답마다 크기를 기록하고 호출자는 본문을 그대로 읽는다", async () => {
    const recorded: number[] = [];
    const payload = JSON.stringify([{ id: 1, name: "가".repeat(100) }]);
    const metered = createMeteredFetch({
      fetch: async () => new Response(payload, { headers: { "content-type": "application/json" } }),
      record: (bytes) => recorded.push(bytes),
      estimateCompressed: () => 0,
    });

    const response = await metered("https://example.supabase.co/rest/v1/entities");

    expect(await response.text()).toBe(payload);
    expect(recorded).toEqual([new TextEncoder().encode(payload).byteLength + EGRESS_RESPONSE_OVERHEAD_BYTES]);
  });

  it("계량이 실패해도 요청은 성공한다", async () => {
    const metered = createMeteredFetch({
      fetch: async () => new Response("ok", { headers: { "content-encoding": "gzip" } }),
      record: () => { throw new Error("기록 실패"); },
      estimateCompressed: () => 1,
    });

    const response = await metered("https://example.supabase.co/rest/v1/x");
    expect(await response.text()).toBe("ok");
  });
});

describe("결제 주기", () => {
  it("주기 시작일 전이면 지난달 주기에 속한다", () => {
    expect(billingCycleStart(new Date("2026-10-07T00:00:00Z"), 23).toISOString()).toBe("2026-09-23T00:00:00.000Z");
    expect(nextBillingCycleStart(new Date("2026-10-07T00:00:00Z"), 23).toISOString()).toBe("2026-10-23T00:00:00.000Z");
  });

  it("주기 시작일 당일부터 새 주기다", () => {
    expect(billingCycleStart(new Date("2026-10-23T00:00:00Z"), 23).toISOString()).toBe("2026-10-23T00:00:00.000Z");
  });

  it("해를 넘기고, 없는 날짜는 말일로 당긴다", () => {
    expect(billingCycleStart(new Date("2027-01-05T00:00:00Z"), 23).toISOString()).toBe("2026-12-23T00:00:00.000Z");
    expect(nextBillingCycleStart(new Date("2027-01-31T12:00:00Z"), 31).toISOString()).toBe("2027-02-28T00:00:00.000Z");
  });

  it("잘못된 설정값은 기본값으로", () => {
    expect(parseBillingCycleDay("15")).toBe(15);
    expect(parseBillingCycleDay("0")).toBe(23);
    expect(parseBillingCycleDay("abc")).toBe(23);
    expect(parseBillingCycleDay(undefined)).toBe(23);
  });
});

describe("예산 판정", () => {
  const now = new Date("2026-10-10T12:00:00Z"); // 주기 9/23 ~ 10/23, 남은 12.5일

  it("하루 예산 안이면 정상", () => {
    const days = ["2026-10-07", "2026-10-08", "2026-10-09"].map((day) => ({ day, bytes: 70_000_000 }));
    const budget = evaluateEgressBudget({ days: [...days, { day: "2026-10-10", bytes: 30_000_000 }], now });
    expect(budget.level).toBe("ok");
    expect(budget.usedBytes).toBe(240_000_000);
    expect(budget.recentDailyBytes).toBe(70_000_000);
    expect(budget.projectedBytes).toBeCloseTo(240_000_000 + 70_000_000 * 12.5, -3);
    expect(budget.firstMeteredDay).toBe("2026-10-07");
  });

  it("이 속도면 주기 안에 한도를 넘는 경우 알린다", () => {
    const days = ["2026-10-07", "2026-10-08", "2026-10-09"].map((day) => ({ day, bytes: 380_000_000 }));
    const budget = evaluateEgressBudget({ days, now });
    expect(budget.level).toBe("alert");
    expect(budget.reasons.join(" ")).toMatch(/주기 말 예상/u);
  });

  it("어제 하루 사용량이 예산의 두 배를 넘으면 바로 알린다", () => {
    const budget = evaluateEgressBudget({ days: [{ day: "2026-10-09", bytes: DAILY_EGRESS_BUDGET_BYTES * 2 + 1 }], now });
    expect(budget.level).toBe("alert");
    expect(budget.yesterdayBytes).toBe(DAILY_EGRESS_BUDGET_BYTES * 2 + 1);
  });

  it("누적이 한도의 60%를 넘으면 경고(최근 속도는 정상)", () => {
    const recent = ["2026-10-07", "2026-10-08", "2026-10-09"].map((day) => ({ day, bytes: 50_000_000 }));
    const budget = evaluateEgressBudget({
      days: [{ day: "2026-09-25", bytes: SUPABASE_FREE_EGRESS_BYTES * 0.65 }, ...recent],
      now,
    });
    expect(budget.level).toBe("warn");
    expect(budget.reasons.join(" ")).toMatch(/이번 주기 사용량/u);
  });

  it("오래전 하루치를 어제처럼 취급하지 않는다", () => {
    // 9/25 에 크게 쓰고 그 뒤로 기록이 없으면(읽지 않았으면) 최근 속도는 0 이다.
    const budget = evaluateEgressBudget({ days: [{ day: "2026-09-25", bytes: 400_000_000 }], now });
    expect(budget.yesterdayBytes).toBe(0);
    expect(budget.recentDailyBytes).toBe(0);
    expect(budget.level).toBe("ok");
  });

  it("계량 시작 전 날짜는 0 으로 세지 않는다", () => {
    // 어제 처음 계량을 시작했으면 최근 속도는 어제 하루로만 잰다(그저께를 0 으로 넣어 깎지 않는다).
    const budget = evaluateEgressBudget({ days: [{ day: "2026-10-09", bytes: 90_000_000 }], now });
    expect(budget.recentDailyBytes).toBe(90_000_000);
    expect(budget.coversWholeCycle).toBe(false);
  });

  it("지난 주기 기록과 미래 날짜는 이번 주기 합계에 넣지 않는다", () => {
    const budget = evaluateEgressBudget({
      days: [{ day: "2026-09-22", bytes: 9e9 }, { day: "2026-10-11", bytes: 9e9 }, { day: "2026-10-09", bytes: 1_000 }],
      now,
    });
    expect(budget.usedBytes).toBe(1_000);
    expect(budget.coversWholeCycle).toBe(true);
    expect(budget.level).toBe("ok");
  });

  it("같은 날 여러 출처는 합친다", () => {
    const budget = evaluateEgressBudget({
      days: [{ day: "2026-10-09", bytes: 100 }, { day: "2026-10-09", bytes: 50 }],
      now,
    });
    expect(budget.yesterdayBytes).toBe(150);
  });
});

describe("크기 표기", () => {
  it("대시보드와 같은 10진 단위", () => {
    expect(formatBytes(5_000_000_000)).toBe("5.00GB");
    expect(formatBytes(12_345_678)).toBe("12.3MB");
    expect(formatBytes(999)).toBe("999B");
  });
});
