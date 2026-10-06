import type { TrendEntity } from "@ai-trend-radar/types";
import { logoTextFrom } from "./display-name";
import { sourceSignalLabel } from "./entity-sources";

/**
 * 공개 목록 캐시의 크기와 Supabase 읽기량을 묶어 두는 규칙.
 *
 * 2026-10-06 22:36Z 에 Supabase 가 egress 한도 초과(exceed_egress_quota)로 프로젝트를 차단해 사이트와
 * 모든 워크플로가 멈췄다. 이 파일은 그 원인 두 가지를 막는다.
 *
 * 1) 목록이 trend_scores 를 "공개 엔티티의 전체 이력"으로 읽었다. 하루 약 1,600행씩 쌓여 10/06 에
 *    7만 행(압축 후 약 2.5MB)이었고, 캐시가 30분마다 갱신될 때마다 이걸 다시 받았다. 8월에
 *    egress 를 줄였을 땐 7,686행이었다 — 읽기량이 시간에 비례해 커지는 구조라 한 번 줄여도 다시
 *    한도에 닿는다. 그래서 기간 창(LIST_SCORE_WINDOW_DAYS)을 건다.
 *
 * 2) Next 의 unstable_cache 는 JSON 이 2MB 를 넘는 값을 저장하지 않는다(경고만 남기고 버린다 —
 *    next/dist/server/lib/incremental-cache/index.js "items over 2MB can not be cached"). 그러면 모든
 *    요청(상세 페이지 포함 — getPublishedTrend 가 목록에서 slug 를 찾는다)이 Supabase 를 다시 읽는다.
 *    8/26 실측 항목당 약 1,228자(스파크라인 12점 기준) × 10/06 공개 1,619건 ≈ 2.0MB 로 한도의 95%였다.
 *    공개 엔티티는 하루 20~30건씩 늘어 며칠 안에 넘을 상태였다. 그래서
 *    - 캐시에는 중복·상수 필드를 뺀 압축형(CompactTrend, 항목당 약 830자)만 넣고 expandTrend 로 복원한다.
 *    - 목록을 TREND_CACHE_SLICE_SIZE 건씩 조각으로 나눠 따로 캐시한다. 목록이 아무리 길어져도
 *      조각 하나는 상한에 닿지 않는다(압축만으로는 약 5주 뒤 다시 2MB 에 닿는다).
 */

/** 목록이 읽는 점수 이력 기간(일). 스파크라인 최대 12점(하루 1스냅샷) + 직전 점수 비교에 충분하다. */
export const LIST_SCORE_WINDOW_DAYS = 13;

/** Next 데이터 캐시의 항목 상한(JSON 문자열 길이). 넘으면 저장되지 않는다. */
export const NEXT_DATA_CACHE_ITEM_LIMIT = 2 * 1024 * 1024;

/** 이 비율을 넘으면 로그에 경고한다. 공개 엔티티가 하루 20~30건씩 늘어 여유를 미리 알아야 한다. */
export const CACHE_WARN_RATIO = 0.75;

/**
 * 점수 창의 시작 시각(포함). 기준은 "가장 최근 채점 시각"이다 — 오늘을 기준으로 하면 파이프라인이
 * 며칠 멈춘 동안 창이 비어 순위표 전체가 0점이 된다. 채점 이력이 없으면 null(필터 없음).
 */
export function scoreWindowStart(latestCalculatedAt: string | null | undefined, days = LIST_SCORE_WINDOW_DAYS): string | null {
  if (!latestCalculatedAt) return null;
  const time = Date.parse(latestCalculatedAt);
  if (Number.isNaN(time)) return null;
  return new Date(time - days * 86_400_000).toISOString();
}

/**
 * 캐시에 넣는 형태. 다음 필드는 다른 필드에서 그대로 만들어지므로 저장하지 않는다.
 * - tagline: description 과 같은 문자열
 * - logoText: name 에서 계산
 * - signals: 대표 채널·총점·updatedAt 에서 계산(delta24h 만 따로 둔다)
 * - strengths·weaknesses·useCases·targetUsers·koreaOpportunity: 목록에서는 항상 비어 있다
 *   (상세·비교 화면이 withTrendAnalysis 로 채운다)
 */
export type CompactTrend = Omit<TrendEntity,
  "tagline" | "logoText" | "signals" | "strengths" | "weaknesses" | "useCases" | "targetUsers" | "koreaOpportunity"
> & { delta24h: number | null };

export function toCompactTrend(trend: TrendEntity): CompactTrend {
  const {
    tagline: _tagline, logoText: _logoText, signals, strengths: _s, weaknesses: _w, useCases: _u,
    targetUsers: _t, koreaOpportunity: _k, ...rest
  } = trend;
  return { ...rest, delta24h: signals[0]?.delta24h ?? null };
}

export function expandTrend(compact: CompactTrend): TrendEntity {
  const { delta24h, ...rest } = compact;
  const source = compact.sources[0]!;
  return {
    ...rest,
    tagline: compact.description,
    logoText: logoTextFrom(compact.name),
    signals: [{
      source,
      label: sourceSignalLabel(source),
      value: compact.trendScore,
      delta24h,
      unit: "engagement",
      measuredAt: compact.updatedAt,
      reliability: "estimated",
    }],
    strengths: [],
    weaknesses: [],
    useCases: [],
    targetUsers: [],
    koreaOpportunity: "",
  };
}

/**
 * 캐시 조각 하나에 넣는 항목 수. 압축형 항목은 8/26 실측 기준 약 830자(스파크라인 12점)라
 * 500건이면 약 0.42MB — 항목이 지금의 4배로 커져도 상한 안이다. 조각 수는 목록 길이에 따라 늘어난다.
 */
export const TREND_CACHE_SLICE_SIZE = 500;

export type PublishedTrendsBuild = { builtAt: string; trends: CompactTrend[] };
export type PublishedTrendsSlice = { builtAt: string; sliceCount: number; total: number; items: CompactTrend[] };

export function sliceTrends(build: PublishedTrendsBuild, index: number, size = TREND_CACHE_SLICE_SIZE): PublishedTrendsSlice {
  const total = build.trends.length;
  return {
    builtAt: build.builtAt,
    sliceCount: Math.max(1, Math.ceil(total / size)),
    total,
    items: build.trends.slice(index * size, (index + 1) * size),
  };
}

/** 조각을 이어 붙인다. 빌드가 섞였거나 개수가 맞지 않으면 null — 호출부가 직접 빌드한다. */
export function mergeSlices(slices: PublishedTrendsSlice[]): CompactTrend[] | null {
  const first = slices[0];
  if (!first) return null;
  if (slices.length !== first.sliceCount) return null;
  if (slices.some((slice) => slice.builtAt !== first.builtAt)) return null;
  const items = slices.flatMap((slice) => slice.items);
  return items.length === first.total ? items : null;
}

/**
 * 캐시 항목 크기와 상한 대비 비율. Next 는 값을 문자열(body)로 직렬화한 레코드 전체의
 * JSON.stringify 길이를 잰다 — 따옴표가 한 번 더 이스케이프되므로 같은 방식으로 잰다.
 */
export function cachePayloadUsage(value: unknown) {
  const size = JSON.stringify({ body: JSON.stringify(value) }).length;
  return { size, ratio: size / NEXT_DATA_CACHE_ITEM_LIMIT };
}
