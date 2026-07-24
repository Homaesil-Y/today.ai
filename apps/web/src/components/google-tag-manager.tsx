import Script from "next/script";

// GTM 컨테이너 ID는 클라이언트 코드에 항상 노출되는 값이라 비밀정보가 아니다.
// 다만 스테이징 등 다른 컨테이너를 쓰고 싶을 때를 대비해 환경변수로 오버라이드할 수 있게 둔다.
const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID ?? "GTM-WP6FQ3HK";

// <html> 안, <body> 앞에 렌더한다(Next.js 공식 GTM 설치 패턴). afterInteractive라 페이지 로드를 막지 않는다.
export function GoogleTagManagerScript() {
  return (
    <Script
      id="gtm-script"
      strategy="afterInteractive"
      dangerouslySetInnerHTML={{
        __html: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${GTM_ID}');`,
      }}
    />
  );
}

// <body> 시작 직후에 렌더한다. JS 비활성 브라우저를 위한 폴백.
export function GoogleTagManagerNoScript() {
  return (
    <noscript>
      <iframe
        src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
        height="0"
        width="0"
        style={{ display: "none", visibility: "hidden" }}
        title="Google Tag Manager"
      />
    </noscript>
  );
}
