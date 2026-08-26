export const SOURCE_CODES = [
  "product_hunt",
  "github",
  "hacker_news",
  "reddit",
  "threads",
  "instagram",
] as const;

export type SourceCode = (typeof SOURCE_CODES)[number];

export const TREND_STATUSES = [
  "NEW",
  "RISING",
  "SURGING",
  "PEAK",
  "STABLE",
  "FALLING",
  "REVIVAL",
  "WATCH",
] as const;

export type TrendStatus = (typeof TREND_STATUSES)[number];

export type PricingType =
  | "free"
  | "freemium"
  | "paid"
  | "open_source"
  | "unknown";

export interface SourceSignal {
  source: SourceCode;
  label: string;
  value: number;
  /**
   * 직전 스냅샷 대비 변화량. 비교할 이전 스냅샷이 없으면 null — 0(변화 없음)과 구분해야 한다.
   * 예전엔 velocity 점수를 그대로 넣어, 시간 변화와 무관한 값이 "24H 변화"로 표시됐다.
   */
  delta24h: number | null;
  unit: "stars" | "votes" | "points" | "mentions" | "engagement";
  measuredAt: string;
  reliability: "verified" | "estimated" | "delayed";
}

export interface TrendScoreBreakdown {
  crossSource: number;
  velocity: number;
  /** 채널 내 댓글 수 백분위 기반 토론 깊이. 반응 크기(velocity)와 다른 신호다. */
  comments: number;
  productGrowth: number;
  threads: number;
  reddit: number;
  novelty: number;
  instagram: number;
  quality: number;
}

export interface TrendEntity {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  category: string;
  logoText: string;
  canonicalUrl: string;
  githubUrl?: string;
  pricingType: PricingType;
  isOpenSource: boolean;
  status: TrendStatus;
  /** 순위 번호. 순위 대상이 아니면(ranked=false) 0. */
  rank: number;
  /**
   * 순위표 노출 대상인지. false 면 검색·카테고리·상세에는 남고 순위표에서만 빠진다.
   *
   * 반응 신호(velocity·comments·productGrowth·crossSource)가 하한 미달이라 다른 항목과 구분할
   * 근거가 없는 경우다. 근거와 하한 산출은 pipeline 의 RANKING_SIGNAL_FLOOR 참고.
   */
  ranked: boolean;
  rankChange: number;
  trendScore: number;
  trustScore: number;
  sources: SourceCode[];
  signals: SourceSignal[];
  whyTrending: string[];
  strengths: string[];
  weaknesses: string[];
  useCases: string[];
  targetUsers: string[];
  koreaOpportunity: string;
  updatedAt: string;
  firstDetectedAt: string;
  sparkline: number[];
}

export interface RawItem<TPayload = unknown> {
  source: SourceCode;
  sourceItemId: string;
  title: string;
  body: string | null;
  url: string;
  canonicalUrl: string;
  authorName: string | null;
  publishedAt: string;
  collectedAt: string;
  metrics: Record<string, number>;
  rawPayload: TPayload;
}

export interface CollectorContext {
  now: Date;
  signal?: AbortSignal;
  mode: "live" | "fixture";
}

export interface CollectorResult<TPayload = unknown> {
  source: SourceCode;
  startedAt: string;
  finishedAt: string;
  items: RawItem<TPayload>[];
  warnings: string[];
  rateLimit?: {
    remaining: number | null;
    resetAt: string | null;
  };
}

export interface Collector<TConfig, TPayload = unknown> {
  readonly source: SourceCode;
  collect(config: TConfig, context: CollectorContext): Promise<CollectorResult<TPayload>>;
}
