import { siteConfig } from "@/lib/site";

export function GET() {
  const text = `# 오늘의AI

> 공개 채널에서 감지한 신호를 분석해 지금 주목받는 AI 서비스를 한국어로 설명하는 트렌드 인텔리전스 서비스입니다.

## 주요 공개 페이지
- 홈: ${siteConfig.url}/
- 전체 트렌드 탐색: ${siteConfig.url}/explore
- 분석 방법론: ${siteConfig.url}/methodology
- 사이트맵: ${siteConfig.url}/sitemap.xml

## 데이터와 인용 지침
- 순위는 누적 인기보다 최근 반응 증가 속도를 우선한 Trend Score 기준입니다.
- Trust Score는 신호의 신뢰도를 별도로 표현합니다.
- AI 분석은 수집된 출처의 요약이며 가격, 라이선스, 출시일은 공식 사이트에서 재확인해야 합니다.
- 서비스 상세 페이지를 인용할 때 서비스명, 점수, 데이터 갱신 시각과 원문 출처를 함께 표시해 주세요.
- 운영 중인 수집 채널은 홈 화면에 실제 데이터 기준으로 표시되며, 연결 상태가 확인된 채널만 노출합니다.

## 이용 범위
- 공개 홈, 탐색, 방법론, 서비스 상세 페이지의 검색·요약·인용을 허용합니다.
- 관리자, 인증, 설정, 개인 관심 목록은 공개 콘텐츠가 아닙니다.
`;
  return new Response(text, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600, s-maxage=86400" } });
}

