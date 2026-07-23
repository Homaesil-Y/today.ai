import type { Metadata } from "next";
import { ArrowUpRight, Newspaper } from "lucide-react";
import { getLatestNews } from "@/data/news";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "AI 뉴스",
  description: "글로벌 AI 뉴스를 매 3시간 수집해 한국어로 요약한 브리핑입니다.",
  alternates: { canonical: "/news" },
  openGraph: { title: "AI 뉴스 브리핑 | 오늘의AI", description: "글로벌 AI 뉴스를 한국어로 정리한 브리핑.", url: "/news", type: "website" },
};

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric" }).format(new Date(iso));
}

export default async function NewsPage() {
  const news = await getLatestNews();
  const sources = new Set(news.map((item) => item.source)).size;
  const latestLabel = news[0] ? formatDate(news[0].publishedAt) : null;

  return (
    <div className="page">
      <section className="page-heading">
        <div>
          <h1>AI 뉴스 브리핑</h1>
          <p>글로벌 AI 뉴스를 매 3시간 수집해 한국어로 정리합니다.</p>
        </div>
        {news.length > 0 && (
          <div className="freshness"><span className="status-dot" />데이터 업데이트 완료<small>{latestLabel} 기준 · 출처 {sources}곳</small></div>
        )}
      </section>

      {news.length === 0 ? (
        <div className="empty-state">
          <Newspaper size={30} />
          <h2>아직 수집된 뉴스가 없습니다</h2>
          <p>글로벌 AI 뉴스를 3시간마다 수집해 한국어로 정리합니다. 첫 수집이 완료되면 이곳에 표시됩니다.</p>
        </div>
      ) : (
        <div className="news-list">
          {news.map((item) => (
            <article className="news-item" key={item.id}>
              <a className="news-title" href={item.url} target="_blank" rel="noreferrer">{item.title}</a>
              <p className="news-summary">{item.summary}</p>
              <div className="news-meta">
                <span className="news-source">{item.source}</span>
                <span aria-hidden="true">·</span>
                <span>{formatDate(item.publishedAt)}</span>
                <a className="news-external" href={item.url} target="_blank" rel="noreferrer">원문 <ArrowUpRight size={13} aria-hidden="true" /></a>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
