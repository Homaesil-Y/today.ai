import { ArrowLeft, CalendarDays } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StructuredData } from "@/components/structured-data";
import { getDailyReport } from "@/data/reports";
import { absoluteUrl, siteConfig } from "@/lib/site";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ date: string }> };

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00+09:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric", weekday: "short" }).format(date);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { date } = await params;
  if (!DATE_PATTERN.test(date)) return { title: "리포트를 찾을 수 없습니다", robots: { index: false, follow: false } };
  const report = await getDailyReport(date);
  if (!report) return { title: "리포트를 찾을 수 없습니다", robots: { index: false, follow: false } };
  return {
    title: report.title,
    description: report.summary ?? "오늘의 AI 트렌드 리포트",
    alternates: { canonical: `/reports/${date}` },
    openGraph: { title: `${report.title} | 오늘의AI`, description: report.summary ?? "", url: `/reports/${date}`, type: "article" },
  };
}

export default async function ReportDetailPage({ params }: Props) {
  const { date } = await params;
  if (!DATE_PATTERN.test(date)) notFound();
  const report = await getDailyReport(date);
  if (!report) notFound();

  const { topServices, totalPublic } = report.content;
  const articleData = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: report.title,
    description: report.summary ?? undefined,
    url: absoluteUrl(`/reports/${date}`),
    inLanguage: siteConfig.language,
    datePublished: report.publishedAt ?? undefined,
    dateModified: report.publishedAt ?? undefined,
    author: { "@id": absoluteUrl("/#organization") },
    publisher: { "@id": absoluteUrl("/#organization") },
  };

  return (
    <div className="page">
      <StructuredData data={articleData} />
      <header className="page-heading">
        <div>
          <Link className="report-back" href="/reports"><ArrowLeft size={15} aria-hidden="true" />리포트 목록</Link>
          <h1>{report.title}</h1>
          <p className="report-detail-meta"><CalendarDays size={15} aria-hidden="true" />{formatDate(report.reportDate)} · 공개 서비스 {totalPublic}개</p>
        </div>
      </header>

      {report.summary && <section className="content-lead"><p>{report.summary}</p></section>}

      {topServices.length === 0 ? (
        <section className="empty-state"><h2>이 날짜의 상위 서비스 데이터가 없습니다</h2></section>
      ) : (
        <section className="report-rank-list" aria-label="트렌드 상위 서비스">
          {topServices.map((service) => (
            <article className="report-rank-item" key={service.slug}>
              <span className="report-rank-no">{String(service.rank).padStart(2, "0")}</span>
              <div className="report-rank-body">
                <div className="report-rank-head">
                  <Link href={`/services/${service.slug}`} data-ga-event="select_content" data-ga-params={JSON.stringify({ content_type: "report_rank", service_slug: service.slug, position: service.rank })}>{service.name}</Link>
                  <span className="category-chip">{service.category}</span>
                </div>
                {service.summary && <p>{service.summary}</p>}
              </div>
              <div className="report-rank-score">
                <strong>{service.trendScore.toFixed(1)}</strong>
                <small>신뢰도 {service.trustScore.toFixed(0)}</small>
              </div>
            </article>
          ))}
        </section>
      )}

      <div className="content-actions">
        <Link className="button button-primary" href="/explore">전체 트렌드 탐색</Link>
        <Link className="button button-secondary" href="/methodology">분석 방법론</Link>
      </div>
    </div>
  );
}
