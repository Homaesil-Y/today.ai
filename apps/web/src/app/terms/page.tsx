import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "이용약관",
  description: "오늘의AI 서비스 이용 조건, 계정, 콘텐츠의 성격과 책임의 한계를 설명합니다.",
  alternates: { canonical: "/terms" },
  openGraph: {
    title: "이용약관 | 오늘의AI",
    description: "서비스 이용 조건, 계정, 콘텐츠 성격과 책임의 한계를 안내합니다.",
    url: "/terms",
    type: "article",
  },
};

const EFFECTIVE_DATE = "2026년 7월 22일";

export default function TermsPage() {
  return (
    <div className="page content-page">
      <header className="page-heading">
        <div>
          <h1>이용약관</h1>
          <p>시행일: {EFFECTIVE_DATE}</p>
        </div>
      </header>

      <section className="content-lead">
        <p>
          본 약관은 오늘의AI(이하 &ldquo;서비스&rdquo;)의 이용 조건을 정합니다. 서비스에 로그인하거나 서비스를
          이용하면 본 약관에 동의한 것으로 봅니다.
        </p>
      </section>

      <section className="content-section">
        <h2>1. 서비스 내용</h2>
        <p>
          서비스는 GitHub·Hacker News 등 공개된 출처의 신호를 수집·분석해 주목받는 AI 서비스를 한국어로 정리해
          제공합니다. 순위와 점수는 코드 기반 공식과 AI 요약으로 산출한 참고 정보이며, 특정 제품의 품질·투자
          가치·안전성을 보증하지 않습니다.
        </p>
      </section>

      <section className="content-section">
        <h2>2. 계정</h2>
        <ul>
          <li>회원 기능(관심목록, 개인화 등)은 Google 계정 로그인으로 이용할 수 있습니다.</li>
          <li>이용자는 본인 계정의 이용에 대한 책임을 지며, 계정을 타인과 공유해서는 안 됩니다.</li>
          <li>이용자는 언제든지 <Link href="/settings">설정</Link>에서 회원 탈퇴로 계정을 삭제할 수 있습니다.</li>
        </ul>
      </section>

      <section className="content-section">
        <h2>3. 콘텐츠의 성격과 책임의 한계</h2>
        <ul>
          <li>AI 요약은 수집된 공개 근거를 정리한 것으로, 공식 발표나 전문가의 조언을 대체하지 않습니다.</li>
          <li>가격·라이선스·출시일 등은 각 서비스의 공식 사이트에서 재확인해야 합니다.</li>
          <li>서비스는 제공 정보의 정확성·완전성을 위해 노력하지만, 이를 근거로 한 이용자의 결정과 그 결과에 대해 법이 허용하는 범위에서 책임을 지지 않습니다.</li>
          <li>외부 링크로 연결되는 제3자 사이트의 콘텐츠에 대해서는 책임지지 않습니다.</li>
        </ul>
      </section>

      <section className="content-section">
        <h2>4. 이용자의 의무</h2>
        <ul>
          <li>서비스를 부정한 방법으로 이용하거나 자동화 도구로 과도한 부하를 유발하지 않습니다.</li>
          <li>서비스와 다른 이용자의 권리를 침해하는 행위를 하지 않습니다.</li>
        </ul>
      </section>

      <section className="content-section">
        <h2>5. 서비스 변경과 중단</h2>
        <p>
          서비스는 운영상·기술상 필요에 따라 내용을 변경하거나 중단할 수 있습니다. 무료로 제공되는 서비스의
          특성상 사전 고지가 어려운 경우가 있을 수 있습니다.
        </p>
      </section>

      <section className="content-section">
        <h2>6. 약관 변경</h2>
        <p>본 약관은 필요에 따라 개정될 수 있으며, 개정 시 시행일과 함께 본 페이지에 공지합니다.</p>
      </section>

      <div className="content-actions">
        <Link className="button button-secondary" href="/privacy">개인정보처리방침 보기</Link>
        <Link className="button button-secondary" href="/methodology">분석 방법론 보기</Link>
      </div>
    </div>
  );
}
