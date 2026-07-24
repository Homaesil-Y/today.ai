import { CalendarDays, FileText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getPublishedReports } from "@/data/reports";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "AI 트렌드 리포트",
  description: "매일 공개되는 AI 서비스 트렌드 리포트. 그날 주목받은 AI 서비스와 신호를 한국어로 정리합니다.",
  alternates: { canonical: "/reports" },
  openGraph: { title: "AI 트렌드 리포트 | 오늘의AI", description: "매일의 AI 서비스 트렌드를 정리한 공개 리포트입니다.", url: "/reports", type: "website" },
};

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00+09:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric", weekday: "short" }).format(date);
}

export default async function ReportsPage() {
  const reports = await getPublishedReports();

  return (
    <div className="page">
      <header className="page-heading">
        <div>
          <h1>AI 트렌드 리포트</h1>
          <p>매일 주목받은 AI 서비스를 신호와 근거로 정리한 공개 리포트입니다.</p>
        </div>
      </header>

      {reports.length === 0 ? (
        <section className="empty-state">
          <FileText size={30} />
          <h2>아직 공개된 리포트가 없습니다</h2>
          <p>수집·분석이 진행되면 일간 리포트가 이곳에 공개됩니다.</p>
          <Link className="button button-primary" href="/explore">현재 트렌드 살펴보기</Link>
        </section>
      ) : (
        <section className="report-list" aria-label="공개 리포트 목록">
          {reports.map((report) => (
            <Link key={`${report.reportType}-${report.reportDate}`} className="report-card" href={`/reports/${report.reportDate}`} data-ga-event="select_content" data-ga-params={JSON.stringify({ content_type: "report", item_id: report.reportDate })}>
              <span className="report-card-date"><CalendarDays size={15} aria-hidden="true" />{formatDate(report.reportDate)}</span>
              <strong>{report.title}</strong>
              {report.summary && <p>{report.summary}</p>}
            </Link>
          ))}
        </section>
      )}
    </div>
  );
}
