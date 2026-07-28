import type { Metadata } from "next";
import Link from "next/link";
import { TermsContent, TERMS_EFFECTIVE_DATE } from "@/components/legal-content";

export const metadata: Metadata = {
  title: "이용약관",
  description: "오늘의 AI 서비스 이용 조건, 계정, 콘텐츠의 성격과 책임의 한계를 설명합니다.",
  alternates: { canonical: "/terms" },
  openGraph: {
    title: "이용약관 | 오늘의AI",
    description: "서비스 이용 조건, 계정, 콘텐츠 성격과 책임의 한계를 안내합니다.",
    url: "/terms",
    type: "article",
  },
};

export default function TermsPage() {
  return (
    <div className="page content-page">
      <header className="page-heading">
        <div>
          <h1>이용약관</h1>
          <p>시행일: {TERMS_EFFECTIVE_DATE}</p>
        </div>
      </header>

      <TermsContent />

      <div className="content-actions">
        <Link className="button button-secondary" href="/privacy">개인정보처리방침 보기</Link>
        <Link className="button button-secondary" href="/methodology">분석 방법론 보기</Link>
      </div>
    </div>
  );
}
