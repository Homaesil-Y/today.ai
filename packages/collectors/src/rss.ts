import { canonicalizeUrl } from "@ai-trend-radar/scoring";
import { XMLParser } from "fast-xml-parser";
import { withRetry } from "./retry";

export interface NewsFeed {
  source: string;
  url: string;
}

// 엄선한 글로벌 AI 뉴스/공식 블로그 RSS·Atom 피드. 개별 피드 실패는 경고로 처리하고 계속 진행한다.
export const NEWS_FEEDS: NewsFeed[] = [
  { source: "TechCrunch", url: "https://techcrunch.com/category/artificial-intelligence/feed/" },
  { source: "VentureBeat", url: "https://venturebeat.com/category/ai/feed/" },
  { source: "Ars Technica", url: "https://arstechnica.com/ai/feed/" },
  { source: "The Verge", url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml" },
  { source: "MIT Technology Review", url: "https://www.technologyreview.com/topic/artificial-intelligence/feed/" },
  { source: "OpenAI", url: "https://openai.com/news/rss.xml" },
  { source: "Hugging Face", url: "https://huggingface.co/blog/feed.xml" },
];

export interface RawNewsItem {
  source: string;
  url: string;
  canonicalUrl: string;
  title: string;
  snippet: string;
  publishedAt: string;
}

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", processEntities: true });

function toArray<T>(value: T | T[] | undefined | null): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function textOf(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "object" && "#text" in (value as Record<string, unknown>)) {
    return String((value as Record<string, unknown>)["#text"] ?? "");
  }
  return "";
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/gu, " ").replace(/\s+/gu, " ").trim();
}

function pickLink(link: unknown): string {
  if (typeof link === "string") return link;
  for (const entry of toArray(link)) {
    if (typeof entry === "string") return entry;
    if (entry && typeof entry === "object") {
      const rec = entry as Record<string, unknown>;
      const rel = rec["@_rel"];
      if (rec["@_href"] && (!rel || rel === "alternate")) return String(rec["@_href"]);
    }
  }
  const first = toArray(link)[0];
  if (first && typeof first === "object" && "@_href" in (first as Record<string, unknown>)) {
    return String((first as Record<string, unknown>)["@_href"]);
  }
  return "";
}

function parseFeed(xml: string, source: string): RawNewsItem[] {
  const doc = parser.parse(xml) as Record<string, any>;
  const rssItems = toArray(doc?.rss?.channel?.item);
  const atomEntries = toArray(doc?.feed?.entry);
  const entries: { kind: "rss" | "atom"; node: Record<string, unknown> }[] = rssItems.length
    ? rssItems.map((node: Record<string, unknown>) => ({ kind: "rss" as const, node }))
    : atomEntries.map((node: Record<string, unknown>) => ({ kind: "atom" as const, node }));

  const items: RawNewsItem[] = [];
  for (const { kind, node } of entries) {
    const title = stripHtml(textOf(node.title));
    const url = pickLink(node.link);
    if (!title || !url) continue;
    const desc = kind === "rss" ? textOf(node.description) : textOf(node.summary) || textOf(node.content);
    const snippet = stripHtml(desc).slice(0, 400);
    const dateStr = kind === "rss" ? textOf(node.pubDate) : textOf(node.published) || textOf(node.updated);
    const parsedDate = dateStr ? new Date(dateStr) : null;
    const publishedAt = parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate.toISOString() : "";
    let canonicalUrl = url;
    try {
      canonicalUrl = canonicalizeUrl(url);
    } catch {
      canonicalUrl = url;
    }
    items.push({ source, url, canonicalUrl, title, snippet, publishedAt });
  }
  return items;
}

export interface FetchNewsOptions {
  now?: Date;
  signal?: AbortSignal;
  feeds?: NewsFeed[];
  maxPerFeed?: number;
  fetchImpl?: typeof fetch;
}

/**
 * 피드가 HTTP 오류를 돌려줬을 때의 오류. 상태코드를 보존해 재시도 여부를 판단할 수 있게 한다.
 *
 * 예전엔 `new Error("VentureBeat HTTP 429")` 처럼 문자열로만 던져서, 재시도 정책이 429(잠시 뒤
 * 풀림)와 404(영원히 안 풀림)를 구분하지 못했다. 게다가 기본 백오프가 250·500ms 라 429 는 세 번
 * 모두 같은 응답을 받고 끝났다 — 2026-09-15 뉴스 실행에서 VentureBeat 가 매번 누락된 이유다.
 */
export class FeedHttpError extends Error {
  constructor(readonly source: string, readonly status: number, readonly retryAfter: string | null) {
    super(`${source} HTTP ${status}`);
    this.name = "FeedHttpError";
  }

  /** Retry-After 헤더가 지시한 대기(ms). 초 단위 숫자와 HTTP-date 를 모두 받는다. */
  get retryAfterMs(): number | null {
    if (!this.retryAfter) return null;
    const seconds = Number(this.retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
    const at = Date.parse(this.retryAfter);
    return Number.isNaN(at) ? null : Math.max(0, at - Date.now());
  }
}

/** 429 는 기다리면 풀리므로 기본 백오프보다 넉넉히 잡는다. */
const FEED_RETRY_BASE_MS = 5_000;

/**
 * 피드당 최대 시도 횟수.
 *
 * 2회다. 3회로 두면 지속 차단된 피드 하나가 5초+10초를 버리고, 피드는 순차로 가져오므로 그만큼
 * 뒤 피드가 밀린다. 실측(2026-09-15) VentureBeat 는 브라우저 User-Agent 로도 429 를 돌려주고
 * Retry-After 도 주지 않는다 — 요청 폭주가 아니라 소스 쪽의 지속 차단이라, 몇 번을 더 시도해도
 * 같은 답이 온다. 진짜 일시적인 429·5xx 는 한 번의 재시도로 대부분 회복된다.
 */
const FEED_RETRY_ATTEMPTS = 2;

/**
 * 다시 시도할 가치가 있는 피드 오류인지.
 *
 * 429(요청 과다)와 5xx(서버 문제)만 재시도한다. 404·403 같은 영구 오류는 세 번 시도해도 같은
 * 답이 오고 그만큼 다른 피드 수집이 늦어질 뿐이다.
 */
export function isRetryableFeedError(error: unknown): boolean {
  if (error instanceof FeedHttpError) return error.status === 429 || error.status >= 500;
  // 네트워크 계층 실패(fetch failed 등)는 재시도한다.
  return true;
}

export async function fetchNewsFromFeeds(options: FetchNewsOptions = {}): Promise<{ items: RawNewsItem[]; warnings: string[] }> {
  const { now = new Date(), signal, feeds = NEWS_FEEDS, maxPerFeed = 12, fetchImpl = fetch } = options;
  const collected: RawNewsItem[] = [];
  const warnings: string[] = [];

  for (const feed of feeds) {
    try {
      const xml = await withRetry(
        async () => {
          const response = await fetchImpl(feed.url, {
            headers: {
              "user-agent": "oh-ai-news/1.0 (+https://oh-ai-news.vercel.app)",
              accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
            },
            ...(signal ? { signal } : {}),
          });
          if (!response.ok) {
            throw new FeedHttpError(feed.source, response.status, response.headers.get("retry-after"));
          }
          return response.text();
        },
        {
          ...(signal ? { signal } : {}),
          // 429 는 기본 백오프(250ms)로는 절대 풀리지 않는다. 서버가 Retry-After 를 주면 그만큼,
          // 안 주면 고정 대기 후 다시 시도한다.
          attempts: FEED_RETRY_ATTEMPTS,
          baseDelayMs: FEED_RETRY_BASE_MS,
          shouldRetry: isRetryableFeedError,
          retryAfterMs: (error) => (error instanceof FeedHttpError ? error.retryAfterMs : null),
        },
      );
      const parsed = parseFeed(xml, feed.source)
        .slice(0, maxPerFeed)
        .map((item) => ({ ...item, publishedAt: item.publishedAt || now.toISOString() }));
      collected.push(...parsed);
    } catch (error) {
      warnings.push(`${feed.source} 수집 실패: ${error instanceof Error ? error.message : "알 수 없는 오류"}`);
    }
  }

  const seen = new Set<string>();
  const deduped: RawNewsItem[] = [];
  for (const item of collected.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))) {
    if (seen.has(item.canonicalUrl)) continue;
    seen.add(item.canonicalUrl);
    deduped.push(item);
  }
  // 소스 편중(자주 발행하는 매체가 상단을 독식) 방지: 소스별 최신순 목록을 라운드로빈으로 섞는다.
  // 각 소스 내부 순서(최신순)는 유지하면서 앞쪽에 여러 매체가 고르게 등장하게 한다.
  return { items: interleaveBySource(deduped), warnings };
}

function interleaveBySource(items: RawNewsItem[]): RawNewsItem[] {
  const bySource = new Map<string, RawNewsItem[]>();
  for (const item of items) {
    const list = bySource.get(item.source) ?? [];
    list.push(item);
    bySource.set(item.source, list);
  }
  const queues = [...bySource.values()];
  const merged: RawNewsItem[] = [];
  let added = true;
  while (added) {
    added = false;
    for (const queue of queues) {
      const next = queue.shift();
      if (next) {
        merged.push(next);
        added = true;
      }
    }
  }
  return merged;
}
