# SEO · GEO · AEO 구현 기준

## 목표

- SEO: 검색엔진이 공개 페이지를 정확히 색인하고 공유 미리보기를 생성한다.
- GEO: 생성형 검색과 AI 에이전트가 서비스의 목적, 데이터 범위, 갱신 시각과 방법론을 문맥과 함께 인용할 수 있게 한다.
- AEO: 사용자의 핵심 질문에 페이지 본문에서 짧고 검증 가능한 답을 제공한다.

## 구현

- 전역 metadataBase, canonical, Open Graph, Twitter Card, robots 정책
- 메인 `CollectionPage` + `ItemList`, 상세 `SoftwareApplication`, 방법론 `TechArticle`, 공개 FAQ의 `FAQPage` JSON-LD
- 메인 및 서비스별 1200×630 동적 OG 이미지
- 공개 URL만 포함하는 동적 sitemap과 개인·관리자 경로를 제외한 robots 정책
- `/llms.txt`에 공개 페이지, 데이터 해석과 인용 지침 제공
- `/methodology`에서 수집 → 정규화 → 점수 → AI 분석·검수 과정을 사용자에게 공개
- 메인에 구조화 데이터와 같은 내용의 가시적인 질문·답변 블록 제공

## 신뢰성 원칙

- 구조화 데이터에는 화면에 표시되는 공개 정보만 넣는다.
- 점수를 사용자 평점이나 제품 품질로 표현하지 않는다.
- 연결되지 않은 데이터 채널을 현재 수집 중인 것처럼 설명하지 않는다.
- AI 요약은 공식 사실을 대체하지 않는다는 문구를 본문과 AI 안내 파일에 유지한다.
- 관리자·인증·설정·관심 목록은 색인 대상에서 제외한다.

## 운영 검증

- 배포 후 `/robots.txt`, `/sitemap.xml`, `/llms.txt`, `/opengraph-image`가 200인지 확인한다.
- Google Search Console에 sitemap을 제출하고 URL 검사로 canonical과 렌더링을 확인한다.
- Google Rich Results Test와 Schema.org Validator로 JSON-LD 경고를 확인한다.
- 공개 데이터 갱신 후 서비스 상세의 `dateModified`와 sitemap `lastModified`가 함께 바뀌는지 확인한다.

