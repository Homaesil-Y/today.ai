import Link from "next/link";

// 전역 푸터. 모든 페이지 본문 하단에 노출되어 저작권 고지와 법적 링크를 모은다.
// 연도는 렌더 시점 기준으로 자동 갱신된다.
export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="site-footer">
      <nav className="site-footer-links" aria-label="사이트 정보">
        <Link href="/methodology" data-ga-event="select_content" data-ga-params={JSON.stringify({ content_type: "footer", item_id: "methodology" })}>분석 방법론</Link>
        <Link href="/privacy" data-ga-event="select_content" data-ga-params={JSON.stringify({ content_type: "footer", item_id: "privacy" })}>개인정보처리방침</Link>
        <Link href="/terms" data-ga-event="select_content" data-ga-params={JSON.stringify({ content_type: "footer", item_id: "terms" })}>이용약관</Link>
      </nav>
      <p className="site-footer-copy">© {year} 오늘의AI · 공개 신호를 분석한 참고용 정보입니다.</p>
    </footer>
  );
}
