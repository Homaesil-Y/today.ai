/**
 * Supabase 전송량(egress) 계량 — 사이트(apps/web)와 파이프라인(packages/*)이 함께 쓰는 규칙.
 *
 * 왜 있나: 2026-10-06 22:36Z 에 Supabase 가 무료 플랜 egress 한도(월 5GB) 초과로 프로젝트를 차단해
 * 사이트와 모든 워크플로가 멈췄다. Supabase 는 egress 를 대시보드(Organization → Usage)로만 보여주고
 * 가져올 API 가 없어, 한도에 다가가는 것을 아무도 몰랐다. 그래서 우리 코드가 Supabase 에서 받은
 * 응답 크기를 직접 재서 하루치씩 쌓고(public.egress_meter_daily), 한도에 다가가면 워크플로를
 * 실패시켜 GitHub 실패 메일로 알린다.
 *
 * 이 값은 추정이다. Supabase 는 압축된 전송 크기로 세는데, fetch 는 압축을 푼 본문을 돌려주므로
 * 응답에 Content-Length 가 없으면 같은 방식으로 다시 압축해 크기를 추정한다(대략 ±20%).
 * 대시보드 접속·로그인처럼 우리 코드 밖의 전송은 잡히지 않는다. 정확한 값은 대시보드가 기준이다.
 *
 * 이 파일은 런타임 의존성이 없다(node:zlib 같은 압축은 호출부가 넣는다). 웹 번들에도 들어가기 때문이다.
 */

/** Supabase 무료 플랜의 월 egress 한도. 10진 GB 로 잡는다(이진 GiB 보다 작아 보수적이다). */
export const SUPABASE_FREE_EGRESS_BYTES = 5_000_000_000;

/** 응답 헤더 등 본문 밖 전송량 추정치(요청 1건당). */
export const EGRESS_RESPONSE_OVERHEAD_BYTES = 600;

/**
 * 결제 주기 시작일(매월 이 날짜, UTC). 2026-09-23 에 사용량이 초기화된 것을 근거로 23 을 기본값으로 둔다.
 * 다르면 SUPABASE_BILLING_CYCLE_DAY 환경 변수로 바꾼다(대시보드 Usage 화면의 주기 표시가 기준).
 */
export const DEFAULT_BILLING_CYCLE_DAY = 23;

/** 하루 예산(한도를 30일로 나눈 값). 이보다 많이 쓰는 날이 이어지면 주기 안에 한도를 넘는다. */
export const DAILY_EGRESS_BUDGET_BYTES = Math.round(SUPABASE_FREE_EGRESS_BYTES / 30);

/** 경고·알림 기준. 추정치 오차(±20%)와 계량 밖 전송을 감안해 한도보다 일찍 울린다. */
export const EGRESS_THRESHOLDS = {
  warn: { usedShare: 0.6, projectedShare: 0.8, dayBytes: DAILY_EGRESS_BUDGET_BYTES },
  alert: { usedShare: 0.8, projectedShare: 1.0, dayBytes: DAILY_EGRESS_BUDGET_BYTES * 2 },
} as const;

export type EgressTally = { requests: number; bytes: number };

/**
 * 응답 1건이 Supabase 에서 나간 크기(추정). 압축 응답에 Content-Length 가 있으면 그게 전송 크기이고,
 * 없으면(대개 큰 응답은 청크 전송이라 없다) estimateCompressed 로 다시 압축해 잰다.
 */
export function wireBytes(params: {
  decodedBytes: number;
  contentLength: number | null;
  contentEncoding: string | null;
  estimateCompressed: (encoding: string) => number;
}): number {
  const encoding = params.contentEncoding?.trim().toLowerCase() || null;
  const length = params.contentLength !== null && Number.isFinite(params.contentLength) && params.contentLength >= 0
    ? params.contentLength
    : null;
  const body = encoding && encoding !== "identity"
    ? length ?? params.estimateCompressed(encoding)
    : length ?? params.decodedBytes;
  return Math.max(0, Math.round(body)) + EGRESS_RESPONSE_OVERHEAD_BYTES;
}

/**
 * fetch 를 감싸 응답마다 전송 크기를 record 로 넘긴다. supabase-js 의 `global.fetch` 에 넣는다.
 * 계량이 실패해도 요청 결과에는 영향을 주지 않는다.
 */
export function createMeteredFetch(options: {
  fetch: typeof fetch;
  record: (bytes: number) => void;
  estimateCompressed: (body: Uint8Array, encoding: string) => number;
}): typeof fetch {
  return async (input, init) => {
    const response = await options.fetch(input, init);
    try {
      const body = new Uint8Array(await response.clone().arrayBuffer());
      const header = response.headers.get("content-length");
      options.record(wireBytes({
        decodedBytes: body.byteLength,
        contentLength: header === null ? null : Number(header),
        contentEncoding: response.headers.get("content-encoding"),
        estimateCompressed: (encoding) => options.estimateCompressed(body, encoding),
      }));
    } catch {
      // 계량은 부가 기능이다. 본문을 못 읽었다고 실제 요청을 실패시키지 않는다.
    }
    return response;
  };
}

export function parseBillingCycleDay(value: string | undefined | null): number {
  const day = Number(value);
  return Number.isInteger(day) && day >= 1 && day <= 31 ? day : DEFAULT_BILLING_CYCLE_DAY;
}

function cycleDate(year: number, month: number, cycleDay: number): Date {
  // 2월 30일처럼 없는 날짜는 그 달 말일로 당긴다.
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(cycleDay, lastDay)));
}

/** now 가 속한 결제 주기의 시작 시각(UTC 자정). */
export function billingCycleStart(now: Date, cycleDay = DEFAULT_BILLING_CYCLE_DAY): Date {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const thisMonth = cycleDate(year, month, cycleDay);
  if (now.getTime() >= thisMonth.getTime()) return thisMonth;
  return month === 0 ? cycleDate(year - 1, 11, cycleDay) : cycleDate(year, month - 1, cycleDay);
}

/** 다음 결제 주기 시작 시각(= 이번 주기 끝). */
export function nextBillingCycleStart(now: Date, cycleDay = DEFAULT_BILLING_CYCLE_DAY): Date {
  const start = billingCycleStart(now, cycleDay);
  const month = start.getUTCMonth();
  return month === 11 ? cycleDate(start.getUTCFullYear() + 1, 0, cycleDay) : cycleDate(start.getUTCFullYear(), month + 1, cycleDay);
}

/** egress_meter_daily 를 날짜별로 합친 값. day 는 UTC 날짜(YYYY-MM-DD). */
export type EgressDay = { day: string; bytes: number; requests?: number };

export type EgressLevel = "ok" | "warn" | "alert";

export type EgressBudget = {
  cycleStart: string;
  nextCycleStart: string;
  quotaBytes: number;
  /** 이번 주기에 계량된 합계. 계량을 주기 중간에 시작했으면 그 이전분은 빠져 있다. */
  usedBytes: number;
  usedShare: number;
  /**
   * 최근 하루 평균 — 어제부터 거슬러 최대 3일(계량을 시작한 날 이후만). 기록 없는 날은 0 으로 센다
   * (그날 아무것도 읽지 않았다는 뜻이다). 아직 완료된 날이 없으면 오늘 값.
   */
  recentDailyBytes: number;
  projectedBytes: number;
  projectedShare: number;
  /** 어제(UTC) 사용량. 계량 시작 전이면 null. */
  yesterdayBytes: number | null;
  todayBytes: number;
  /** 계량 기록이 있는 첫 날. 없으면 null. 이번 주기 시작보다 늦으면 그 전 사용량은 합계에 없다. */
  firstMeteredDay: string | null;
  /** 이번 주기 전체가 계량됐는지(아니면 usedBytes 는 실제보다 작다). */
  coversWholeCycle: boolean;
  level: EgressLevel;
  reasons: string[];
};

const DAY_MS = 86_400_000;

/**
 * 이번 주기 사용량과 주기 말 예상치를 계산하고 경고 단계를 정한다.
 * 예상치 = 지금까지 사용량 + 최근 하루 평균 × 남은 일수.
 */
export function evaluateEgressBudget(params: {
  days: EgressDay[];
  now: Date;
  cycleDay?: number;
  quotaBytes?: number;
}): EgressBudget {
  const cycleDay = params.cycleDay ?? DEFAULT_BILLING_CYCLE_DAY;
  const quotaBytes = params.quotaBytes ?? SUPABASE_FREE_EGRESS_BYTES;
  const start = billingCycleStart(params.now, cycleDay);
  const next = nextBillingCycleStart(params.now, cycleDay);
  const startDay = start.toISOString().slice(0, 10);
  const today = params.now.toISOString().slice(0, 10);

  // 날짜별 합계(오늘까지). 사용 속도는 주기와 무관하게 최근 날짜로 재고, 누적은 이번 주기만 더한다.
  const byDay = new Map<string, number>();
  for (const row of params.days) {
    if (row.day > today) continue;
    byDay.set(row.day, (byDay.get(row.day) ?? 0) + Math.max(0, row.bytes));
  }
  const firstMeteredDay = [...byDay.keys()].sort()[0] ?? null;
  const usedBytes = [...byDay.entries()].filter(([day]) => day >= startDay).reduce((sum, [, value]) => sum + value, 0);
  const todayBytes = byDay.get(today) ?? 0;
  const todayStart = Date.parse(`${today}T00:00:00Z`);
  const daysAgo = (count: number) => new Date(todayStart - count * DAY_MS).toISOString().slice(0, 10);
  const metered = (day: string) => firstMeteredDay !== null && day >= firstMeteredDay;
  const recentDays = [1, 2, 3].map(daysAgo).filter(metered);
  const recentDailyBytes = recentDays.length > 0
    ? recentDays.reduce((sum, day) => sum + (byDay.get(day) ?? 0), 0) / recentDays.length
    : todayBytes;
  const remainingDays = Math.max(0, (next.getTime() - params.now.getTime()) / DAY_MS);
  // 오늘은 이미 일부 사용했으므로 남은 시간만큼만 더한다.
  const projectedBytes = usedBytes + recentDailyBytes * remainingDays;
  const yesterday = daysAgo(1);
  const yesterdayBytes = metered(yesterday) ? byDay.get(yesterday) ?? 0 : null;

  const usedShare = usedBytes / quotaBytes;
  const projectedShare = projectedBytes / quotaBytes;
  const reasons: string[] = [];
  const check = (threshold: (typeof EGRESS_THRESHOLDS)["warn" | "alert"]) => {
    const hits: string[] = [];
    if (usedShare >= threshold.usedShare) hits.push(`이번 주기 사용량 ${formatBytes(usedBytes)} (한도의 ${Math.round(usedShare * 100)}%)`);
    if (projectedShare >= threshold.projectedShare) hits.push(`주기 말 예상 ${formatBytes(projectedBytes)} (한도의 ${Math.round(projectedShare * 100)}%)`);
    if (yesterdayBytes !== null && yesterdayBytes >= threshold.dayBytes) hits.push(`어제(${yesterday}) 하루 ${formatBytes(yesterdayBytes)} (하루 예산 ${formatBytes(DAILY_EGRESS_BUDGET_BYTES)})`);
    return hits;
  };
  const alertHits = check(EGRESS_THRESHOLDS.alert);
  const warnHits = alertHits.length > 0 ? alertHits : check(EGRESS_THRESHOLDS.warn);
  reasons.push(...warnHits);
  const level: EgressLevel = alertHits.length > 0 ? "alert" : warnHits.length > 0 ? "warn" : "ok";

  return {
    cycleStart: startDay,
    nextCycleStart: next.toISOString().slice(0, 10),
    quotaBytes,
    usedBytes,
    usedShare,
    recentDailyBytes,
    projectedBytes,
    projectedShare,
    yesterdayBytes,
    todayBytes,
    firstMeteredDay,
    coversWholeCycle: firstMeteredDay !== null && firstMeteredDay <= startDay,
    level,
    reasons,
  };
}

/** 사람이 읽는 크기(10진 단위 — Supabase 대시보드와 같다). */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)}GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)}MB`;
  if (bytes >= 1e3) return `${Math.round(bytes / 1e3)}KB`;
  return `${Math.round(bytes)}B`;
}
