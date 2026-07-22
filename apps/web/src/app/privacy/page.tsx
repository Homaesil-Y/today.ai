import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "개인정보처리방침",
  description: "오늘의 AI가 수집하는 개인정보 항목, 이용 목적, 보관 기간, 처리 위탁과 이용자의 권리를 설명합니다.",
  alternates: { canonical: "/privacy" },
  openGraph: {
    title: "개인정보처리방침 | 오늘의 AI",
    description: "수집 항목, 이용 목적, 보관 기간, 위탁 업체와 이용자 권리를 투명하게 공개합니다.",
    url: "/privacy",
    type: "article",
  },
};

const EFFECTIVE_DATE = "2026년 7월 22일";

export default function PrivacyPage() {
  return (
    <div className="page content-page">
      <header className="page-heading">
        <div>
          <h1>개인정보처리방침</h1>
          <p>시행일: {EFFECTIVE_DATE}</p>
        </div>
      </header>

      <section className="content-lead">
        <p>
          오늘의 AI(이하 &ldquo;서비스&rdquo;)는 이용자의 개인정보를 중요하게 생각하며, 서비스 제공에 필요한
          최소한의 정보만 수집합니다. 본 방침은 어떤 정보를 어떤 목적으로 처리하고 얼마나 보관하는지,
          그리고 이용자가 어떤 권리를 행사할 수 있는지 설명합니다.
        </p>
      </section>

      <section className="content-section">
        <h2>1. 수집하는 개인정보 항목</h2>
        <ul>
          <li><strong>계정 정보</strong>: Google 계정으로 로그인할 때 제공되는 이메일 주소, 표시 이름, 프로필 이미지 URL입니다. 비밀번호는 저장하지 않습니다.</li>
          <li><strong>서비스 이용 정보</strong>: 관심 등록한 서비스, 관심목록 폴더와 메모, 관심 카테고리, 알림 환경설정(요약 수신 여부, 기준 시간 등)입니다.</li>
          <li><strong>자동 생성 정보</strong>: 로그인 세션 유지에 필요한 인증 토큰(쿠키)입니다. 광고·추적 목적의 제3자 쿠키는 사용하지 않습니다.</li>
        </ul>
        <p>서비스가 공개하는 AI 서비스 순위·분석 데이터는 공개된 출처에서 수집한 정보이며 이용자의 개인정보가 아닙니다.</p>
      </section>

      <section className="content-section">
        <h2>2. 개인정보의 이용 목적</h2>
        <ul>
          <li>Google 로그인 기반 회원 식별과 인증</li>
          <li>관심목록, 폴더, 메모, 관심 카테고리 등 개인화 기능 제공</li>
          <li>이용자가 설정한 알림 환경설정에 따른 서비스 제공</li>
          <li>부정 이용 방지와 서비스 안정성 유지</li>
        </ul>
      </section>

      <section className="content-section">
        <h2>3. 보관 기간</h2>
        <p>
          개인정보는 회원 자격을 유지하는 동안 보관하며, 이용자가 회원 탈퇴를 하면 계정 정보와 서비스 이용
          정보가 즉시 영구 삭제됩니다. 관계 법령에 따라 보존이 요구되는 경우에는 해당 기간 동안만 보관합니다.
        </p>
      </section>

      <section className="content-section">
        <h2>4. 처리 위탁 및 국외 이전</h2>
        <p>서비스는 아래의 신뢰할 수 있는 사업자에게 개인정보 처리를 위탁하거나 이를 통해 처리합니다.</p>
        <ul>
          <li><strong>Google</strong>: OAuth 로그인 인증</li>
          <li><strong>Supabase</strong>: 데이터베이스·인증 저장소 호스팅</li>
          <li><strong>Vercel</strong>: 웹 애플리케이션 호스팅</li>
        </ul>
        <p>
          AI 분석에 사용하는 Gemini API에는 공개된 AI 서비스 데이터만 전달하며, 이용자의 개인정보는 전달하지
          않습니다. 위 사업자의 서버는 국외에 위치할 수 있으며, 로그인·서비스 이용 시 이에 동의한 것으로 봅니다.
        </p>
      </section>

      <section className="content-section">
        <h2>5. 이용자의 권리와 행사 방법</h2>
        <ul>
          <li><strong>열람·수정</strong>: <Link href="/settings">설정</Link>에서 관심 카테고리와 알림 환경설정을 직접 확인·변경할 수 있습니다.</li>
          <li><strong>삭제(회원 탈퇴)</strong>: <Link href="/settings">설정</Link> 하단의 회원 탈퇴에서 계정과 모든 개인 데이터를 직접 영구 삭제할 수 있습니다.</li>
          <li><strong>동의 철회</strong>: 로그아웃 후 서비스를 이용하지 않거나 회원 탈퇴로 동의를 철회할 수 있습니다.</li>
        </ul>
      </section>

      <section className="content-section">
        <h2>6. 개인정보의 안전성 확보</h2>
        <p>
          서비스는 데이터베이스 접근을 행 수준 보안(RLS)으로 제한해 이용자가 본인의 데이터에만 접근하도록
          하며, 서버 전용 비밀키는 브라우저에 노출하지 않습니다. 전송 구간은 HTTPS로 암호화합니다.
        </p>
      </section>

      <section className="content-section">
        <h2>7. 방침 변경</h2>
        <p>본 방침은 법령이나 서비스 변경에 따라 개정될 수 있으며, 개정 시 시행일과 함께 본 페이지에 공지합니다.</p>
      </section>

      <div className="content-actions">
        <Link className="button button-secondary" href="/terms">이용약관 보기</Link>
        <Link className="button button-secondary" href="/methodology">분석 방법론 보기</Link>
      </div>
    </div>
  );
}
