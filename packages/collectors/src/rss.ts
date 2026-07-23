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
          if (!response.ok) throw new Error(`${feed.source} HTTP ${response.status}`);
          return response.text();
        },
        signal ? { signal } : {},
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
  return { items: deduped, warnings };
}
