import type { Metadata } from "next";
import Link from "next/link";
import { PrivacyContent, PRIVACY_EFFECTIVE_DATE } from "@/components/legal-content";

export const metadata: Metadata = {
  title: "개인정보처리방침",
  description: "오늘의AI가 수집하는 개인정보 항목, 이용 목적, 보관 기간, 처리 위탁과 이용자의 권리를 설명합니다.",
  alternates: { canonical: "/privacy" },
  openGraph: {
    title: "개인정보처리방침 | 오늘의AI",
    description: "수집 항목, 이용 목적, 보관 기간, 위탁 업체와 이용자 권리를 투명하게 공개합니다.",
    url: "/privacy",
    type: "article",
  },
};

export default function PrivacyPage() {
  return (
    <div className="page content-page">
      <header className="page-heading">
        <div>
          <h1>개인정보처리방침</h1>
          <p>시행일: {PRIVACY_EFFECTIVE_DATE}</p>
        </div>
      </header>

      <PrivacyContent />

      <div className="content-actions">
        <Link className="button button-secondary" href="/terms">이용약관 보기</Link>
        <Link className="button button-secondary" href="/methodology">분석 방법론 보기</Link>
      </div>
    </div>
  );
}
