# 요구사항 추적표

기준 문서: `ai-trend-radar-codex-development-plan.md`(DEV), `ai-trend-radar-ui-design-spec.md`(UI). 상태는 현재 저장소 구현을 기준으로 하며, fixture는 실제 외부 연동 완료로 간주하지 않는다.

| ID | 영역 | 요구사항 | 출처 문서 | 구현 위치 | 우선순위 | 상태 | 비고 |
|---|---|---|---|---|---|---|---|
| PROD-001 | 목표 | 6개 채널에서 신규 AI 서비스를 탐지하고 한국어 트렌드 인텔리전스 제공 | DEV 1, 41 | 전 프로젝트 | P0 | IN_PROGRESS | 최초 동작 골격 완료 |
| PROD-002 | 가치 | 발견·검증·설명·활용·추적 가치 제공 | DEV 1.2 | UI, 분석·리포트 파이프라인 | P0 | IN_PROGRESS | 설명 UI 우선 구현 |
| PROD-003 | 사용자 | PM·개발자·마케터·창업자·리서처·일반 사용자 지원 | DEV 1.3 | 정보 구조 및 콘텐츠 | P1 | IN_PROGRESS | 공개 화면 기준 |
| DATA-001 | 채널 | Product Hunt 핵심 수집 | DEV 2, 3.1, 36 | `packages/collectors/src/product-hunt.ts`, `packages/pipeline/src/candidate.ts` | P0 | ADAPTER_READY | GraphQL v2 어댑터·pagination·rate-limit·fixture·후보 변환·파이프라인 수용까지 구현. 실 live 호출은 `PRODUCT_HUNT_TOKEN` 발급 후 활성화(미설정 시 blocked) |
| DATA-002 | 채널 | GitHub 저장소·메트릭·스냅샷 입력 수집 | DEV 3.2 | `packages/collectors/src/github.ts` | P0 | DONE | live/fixture, Zod 검증 |
| DATA-003 | 채널 | Hacker News 글·점수·댓글 수집 | DEV 3.3 | `packages/collectors/src/hacker-news.ts` | P0 | DONE | live/fixture, Zod 검증 |
| DATA-004 | 채널 | Reddit 대상 subreddit·게시물·댓글 수집 | DEV 3.4 | `packages/collectors/src/reddit.ts`, `packages/pipeline/src/candidate.ts` | P0 | ADAPTER_READY | client credentials OAuth·pagination·rate-limit·fixture·후보 변환 구현. 실 live 호출은 `REDDIT_CLIENT_ID/SECRET` 발급 후 활성화(미설정 시 blocked) |
| DATA-005 | 채널 | Threads 키워드·후보명 재검색·독립 작성자 분석 | DEV 3.5 | collector adapter 예정 | P0 | BLOCKED | 앱 권한·검색 범위 확인 필요 |
| DATA-006 | 채널 | Instagram은 보조 가산 신호로만 수집 | DEV 3.6 | collector adapter 예정 | P0 | BLOCKED | Graph API 권한 필요 |
| DATA-007 | 정책 | X는 MVP에서 제외 | DEV 2.1, 36 | 아키텍처/문서 | P1 | DEFERRED | 의도적 제외 |
| DATA-008 | 원본 | raw payload와 정규화 데이터를 분리 저장 | DEV 4, 29 | `raw_items`, 공통 `RawItem`, `SupabaseCollectorStore` | P0 | DONE | GitHub 30·HN 50건 저장, 재수집 upsert 멱등성 검증 |
| PIPE-001 | 파이프라인 | Collector→Raw→정규화→분류→통합→스냅샷→점수→LLM→리포트 | DEV 4 | `packages/pipeline`, `docs/entity-pipeline.md` | P0 | IN_PROGRESS | 리포트 제외 저장 파이프라인 실적재 검증 완료 |
| PIPE-002 | 파이프라인 | 장시간 수집을 웹 요청에서 분리 가능한 worker로 구성 | DEV 27, 28 | `packages/collectors`, 향후 `apps/worker` | P0 | IN_PROGRESS | 패키지 분리, worker 미생성 |
| CLASS-001 | 분류 | AI 관련성 9개 상태 분류 | DEV 5 | `packages/pipeline/src/candidate.ts` | P0 | IN_PROGRESS | AI/제품 의도·교육/논문/스팸 규칙 필터 구현, 9개 상태 후속 |
| CLASS-002 | 분류 | 분류 confidence·reason·spam probability 저장 | DEV 5 | migration 확장 예정 | P0 | NOT_STARTED | 스키마 보완 필요 |
| ENTITY-001 | 통합 | 공식 도메인·repo·외부 링크·이름·조직 기반 동일 서비스 통합 | DEV 6 | `packages/pipeline/src/repository.ts`, `entities`, `aliases`, `mentions` | P0 | IN_PROGRESS | URL·repo·domain 자동 통합 구현, 이름·조직 고도화 후속 |
| ENTITY-002 | 통합 | URL canonicalization | DEV 4, 6 | `packages/scoring/src/index.ts` | P0 | DONE | 추적 파라미터·host·slash 정규화 |
| ENTITY-003 | 통합 | 병합·분리·대표명·URL·별칭·리브랜딩 관리자 수정 | DEV 6 | 관리자 기능 예정 | P1 | NOT_STARTED | 스키마 감사 이력 보완 필요 |
| SCORE-001 | 점수 | 100점 가중치(25/20/15/12/10/8/5/5) 결정적 계산 | DEV 8.2 | `packages/scoring` | P0 | DONE | v1, 단위 테스트 |
| SCORE-002 | 점수 | 플랫폼 내부 백분위/로그 정규화 | DEV 8.1 | scoring pipeline 예정 | P0 | NOT_STARTED | 실제 스냅샷 필요 |
| SCORE-003 | 점수 | 누적보다 최근 증가 속도 우선 | DEV 3.2, 8.1 | snapshot/scoring 예정 | P0 | IN_PROGRESS | 데이터 모델 완료 |
| SCORE-004 | 점수 | Instagram은 감점 없이 최대 5점 가산 | DEV 3.6, 8.2 | `packages/scoring` | P0 | DONE | 항목 상한 적용 |
| SCORE-005 | 신뢰 | 독립 작성자·반복 문구·제휴·후기·이상 급증 기반 Trust Score | DEV 8.3 | scoring 예정 | P0 | NOT_STARTED | 원시 신호 필요 |
| SCORE-006 | 상태 | NEW/RISING/SURGING/PEAK/STABLE/FALLING/REVIVAL/WATCH | DEV 7 | `packages/scoring`, UI badge | P0 | DONE | 결정 로직·UI 상태 정의 |
| SCORE-007 | 재현성 | scoring version 저장 및 동일 입력 동일 결과 | DEV 8, 29, 38 | `SCORING_VERSION`, `trend_scores` | P0 | DONE | v1 테스트 |
| LLM-001 | 분석 | 한국어 summary/why/target/strength/weakness/use case 등 생성 | DEV 9 | `packages/llm`, `packages/pipeline/src/runner.ts` | P1 | DONE | 실행당 최대 50건 순차 분석(무료 한도 도달 시 중단). 미분석 review 후보 → 오래된 public 재분석 순서로 우선 처리, 보류(private) 제외, 실데이터 저장 검증 |
| LLM-002 | 분석 | 출처 없는 사실 금지·불확실 정보 표시 | DEV 9 | versioned prompt, evidence input schema | P0 | DONE | 제공 출처·공식 사실만 입력, 미확인 가격 unknown |
| LLM-003 | 분석 | 출력 schema validation, 모델·prompt version 저장 | DEV 9, 39 | `ai_analyses`, `packages/llm`, `packages/pipeline` | P0 | DONE | Gemini JSON Schema+Zod·model/prompt metadata·DB 저장 검증 |
| AUTH-001 | 인증 | Google OAuth만 제공, 비밀번호 인증 금지 | DEV 11 | Supabase SSR, `/login`, callback | P0 | DONE | 운영 OAuth·callback 연결 완료 |
| AUTH-002 | 인증 | 최초 로그인 시 최소 프로필 자동 생성 | DEV 11.1~11.2 | `202607190002_auth_profile_trigger.sql` | P0 | DONE | 프로필·기본 설정·전체 관심목록 생성 |
| AUTH-003 | 공개 | 비로그인 메인·랭킹·상세·검색·공개 리포트 제공 | DEV 10.1 | Next 공개 routes | P0 | IN_PROGRESS | 메인·상세·검색·탐색 완료, 공개 리포트 후속 |
| AUTH-004 | 회원 | 관심목록·폴더·메모·구독·알림·비교 저장 | DEV 10.2, 18, 21 | `watchlist`, `settings`, RLS | P1 | IN_PROGRESS | 관심 폴더·이동·메모·점수 비교·환경설정 완료, 비교 저장 후속 |
| AUTH-005 | 권한 | 관리자 권한을 API와 DB에서 검증 | DEV 11.4, 34 | `is_admin()`, RLS | P0 | DONE | 서버 API 추가 시 동일 검증 필요 |
| AUTH-006 | RLS | 사용자 메모·설정은 본인만 접근 | DEV 34 | migration RLS | P0 | DONE | 초안 정책 |
| DB-001 | DB | sources/raw_items/entities/aliases/mentions | DEV 29 | Supabase migration | P0 | DONE | 초안 |
| DB-002 | DB | metric_snapshots/trend_scores/ai_analyses | DEV 29 | Supabase migration | P0 | DONE | 초안 |
| DB-003 | DB | categories/profiles/preferences/watchlists/items | DEV 29 | Supabase migration | P0 | DONE | 초안 |
| DB-004 | DB | reports/notifications/collector_runs | DEV 29 | Supabase migration | P0 | DONE | 초안 |
| DB-005 | 시간 | 저장 UTC, 표시 사용자 시간대, 기본 Asia/Seoul | 요청문, DEV 21, 30 | timestamptz, `.env.example` | P0 | DONE | fixture UI KST 표기 |
| UI-001 | 콘셉트 | Signal Intelligence, 금융 신뢰감+AI 미래성+리포트 가독성 | UI 1~2 | `globals.css`, 화면 구성 | P0 | DONE | 과장된 랜딩 표현 배제 |
| UI-002 | 테마 | OS와 무관하게 Light 기본, 미완성 Dark 미노출 | UI 3 | CSS `color-scheme: light` | P0 | DONE | semantic token 구조 |
| UI-003 | 토큰 | 배경·텍스트·경계·브랜드·상태·피드백 토큰 | UI 4.1 | `globals.css :root` | P0 | DONE | 컴포넌트 색상 직접 하드코딩 최소화 |
| UI-004 | 토큰 | 타이포·tabular nums·spacing·radius·shadow | UI 4.2~4.5 | `globals.css` | P0 | DONE | 시스템 규칙 적용 |
| UI-005 | Shell | sticky header, 검색, sidebar, mobile bottom nav | UI 5~6 | `app-shell.tsx` | P0 | DONE | 반응형 전환 |
| UI-006 | 공통 | Button/Input/Badge 상태·44px touch·focus | UI 7, 18 | CSS, StatusBadge, 원문 dialog | P0 | IN_PROGRESS | 원문 모달 완료, toast 후속 |
| UI-007 | TOP3 | TOP1 대형, TOP2·3 보조 계층 | UI 8 | `trend-cards.tsx` | P0 | DONE | desktop/tablet/mobile |
| UI-008 | KPI | 4개 동일 높이 KPI와 전일 변화 | UI 8.5, 12.1 | dashboard | P0 | DONE | 모바일 가로 스크롤 |
| UI-009 | 랭킹 | 8열 TOP10 table, mobile card 전환 | UI 9, 12.1, 13.4 | `ranking-table.tsx` | P0 | DONE | fixture 연결 |
| UI-010 | 차트 | 축·단위·기간·대체 설명이 있는 trend chart | UI 10 | detail fixture chart | P1 | IN_PROGRESS | 구조 완료, 실제 chart lib 미사용 |
| UI-011 | 레이더 | 4개 링과 list selection 연동 | UI 11 | Phase 3 예정 | P2 | DEFERRED | 최초 목표 후속 |
| UI-012 | 메인 | 날짜→KPI→TOP3→랭킹→카테고리→신규→채널→관심 순서 | UI 12.1 | `app/page.tsx`, `/categories` | P0 | IN_PROGRESS | 메인 핵심·카테고리 허브 완료, 신규·채널 섹션 후속 |
| UI-013 | 탐색 | 필터·정렬·card/list/radar | UI 12.2 | `explore/page.tsx`, `trend-query.ts` | P1 | IN_PROGRESS | 검색·기간·카테고리·채널·신뢰도·정렬 완료, 뷰 전환·레이더 후속 |
| UI-014 | 상세 | 헤더·AI 분석·그래프·지표·반응·출처·활용·국내 기회 | UI 12.3 | `services/[slug]/page.tsx` | P0 | DONE | fixture 데이터 |
| UI-015 | 관심 | 폴더·점수 차이·메모·빈 상태 | UI 12.4 | `/watchlist`, server actions, DB | P1 | DONE | 생성·이동·빈 폴더 삭제·메모·저장 점수 비교 완료 |
| UI-016 | 비교 | 최대 4개 비교, 모바일 sticky first column | UI 12.5 | placeholder | P2 | DEFERRED | Phase 7 |
| UI-017 | 리포트 | 카드 목록과 문서형 상세 | UI 12.6 | placeholder + DB | P1 | NOT_STARTED | 데일리 우선 |
| UI-018 | 로그인 | Google 단일 CTA, 비밀번호 없음, 공개 탐색 링크 | UI 12.7 | `/login`, OAuth callback | P0 | DONE | 원래 경로 복귀 포함 |
| UI-019 | 온보딩 | 관심 카테고리·알림·완료 3단계 이하 | UI 12.8 | `/onboarding`, profile/preferences | P1 | DONE | 한 화면, 선택 없이 진행 허용 |
| UI-020 | 설정 | 프로필·카테고리·알림·구독·Light·개인정보·탈퇴 | UI 12.9 | `/settings` | P1 | IN_PROGRESS | 카테고리·알림·시간 완료, 개인정보·탈퇴 후속 |
| ADMIN-001 | 관리자 | 수집 KPI·채널 상태·실패·대기·호출량 | DEV 22, UI 12.10 | Phase 6 | P1 | NOT_STARTED | collector_runs schema 완료 |
| ADMIN-002 | 관리자 | 후보 승인·스팸·수정·공개·분석 재생성 | DEV 22.2 | `/admin/review`, server actions | P1 | IN_PROGRESS | 원문 모달·검색·필터·분석 전 승인 차단 완료, 수정·재생성 후속 |
| ADMIN-003 | 관리자 | 키워드·subreddit·hashtag·동적 서비스 검색 관리 | DEV 22.3 | Phase 6 | P1 | NOT_STARTED | 설정 테이블 필요 |
| ADMIN-004 | 관리자 | 가중치·임계값·장애 제외·재계산·버전 관리 | DEV 22.4 | Phase 6 | P1 | IN_PROGRESS | 코드 상수만 존재 |
| UX-001 | 상태 | loading skeleton, empty, error, partial, disabled, unauth, stale | 요청문, UI 14, 19 | partial banner, placeholder | P0 | IN_PROGRESS | 공통 상태 컴포넌트 후속 |
| UX-002 | 신선도 | 주요 데이터 갱신 시각·지연 표시 | UI 14.5 | Shell, dashboard, detail | P0 | DONE | fixture 시각 명시 |
| UX-003 | 낙관 UI | 관심·폴더·메모·알림 toggle과 rollback | UI 14.4 | `watch-button.tsx` | P1 | IN_PROGRESS | 로컬 optimistic만 구현 |
| MOTION-001 | 모션 | 120/180/240ms, 과도한 배경·float 금지 | UI 15 | CSS tokens | P1 | DONE | hover만 제한 적용 |
| A11Y-001 | 접근성 | WCAG AA 대비·색상 외 텍스트 상태 | UI 18 | 토큰/상태 배지 | P0 | DONE | 자동 감사 필요 |
| A11Y-002 | 접근성 | keyboard focus·aria label·semantic table | UI 18 | 공통 UI | P0 | DONE | modal focus trap은 후속 |
| A11Y-003 | 접근성 | chart 대체 설명·loading/toast live region | UI 18 | sparkline aria, partial status | P0 | IN_PROGRESS | toast 미구현 |
| A11Y-004 | 접근성 | touch 44px·reduced motion | UI 18, 15.5 | CSS | P0 | DONE | 모바일 nav/button 적용 |
| RESP-001 | 반응형 | desktop 248px sidebar/1440 content/12-col | UI 5.1, 13 | CSS | P0 | DONE | 시각 QA 필요 |
| RESP-002 | 반응형 | tablet 80px sidebar, TOP1 full, TOP2·3 2-col | UI 5.2, 13 | CSS | P0 | DONE | 시각 QA 필요 |
| RESP-003 | 반응형 | mobile 56px header/64px nav/16px padding/card list | UI 5.3, 13 | CSS | P0 | DONE | 시각 QA 필요 |
| SEO-001 | SEO | SSR/SSG metadata·canonical·OG·sitemap·robots·slug | DEV 32 | Next metadata routes | P1 | DONE | 공개/개인 색인 경계와 상세 metadata 포함 |
| SEO-002 | 공유 | 서비스/일일 TOP10 동적 OG 이미지 | DEV 32 | `opengraph-image.tsx` | P2 | DONE | 홈·서비스별 1200×630 이미지 |
| SEO-003 | GEO/AEO | AI 인용 안내·방법론·질문형 답변·엔티티 구조화 데이터 | 사용자 요청 | `/llms.txt`, `/methodology`, JSON-LD | P1 | DONE | 공개 정보와 실제 화면 문구 일치 |
| SEC-001 | 보안 | API 키는 server env, 클라이언트 노출 금지 | DEV 34 | `.env.example`, adapter | P0 | DONE | service key 서버 전용 |
| SEC-002 | 보안 | 외부 HTML/Markdown 및 사용자 입력 sanitize | DEV 34 | 렌더러/API 예정 | P0 | NOT_STARTED | 현재 raw HTML 미렌더링 |
| SEC-003 | 개인정보 | 정책·약관·탈퇴·삭제·보관 정책 | DEV 34 | 문서/화면 예정 | P1 | NOT_STARTED | 법률 검토 필요 |
| OPS-001 | 운영 | 정기 수집·처리, 시간별 AI 분석 재시도, 공개·메일 | DEV 30 | `.github/workflows/scheduled-pipeline.yml`, `.github/workflows/hourly-analysis.yml` | P1 | IN_PROGRESS | 6시간마다 수집·점수 계산, 매시간 남은 후보 분석·자동 승인(무료 한도 내 순차 처리). 메일·운영 worker 후속 |
| OPS-002 | 운영 | Vercel web, Supabase, 장기 worker 분리 | DEV 27 | Vercel·Supabase·GitHub Actions | P1 | IN_PROGRESS | 웹·DB 운영 연결 완료, 장기 worker 분리 후속 |
| OPS-003 | 이메일 | Resend 데일리 리포트·기본 08:00 사용자 시간대 | DEV 20~21 | provider 예정 | P1 | BLOCKED | 도메인/API key 필요 |
| QA-001 | 품질 | strict TypeScript, 외부·LLM Zod 검증, any 최소화 | 요청문, DEV 39 | tsconfig, collectors | P0 | DONE | exact optional 사용 |
| QA-002 | 품질 | build·typecheck·lint·unit test 통과 | 요청문, UI 24 | root scripts/CI | P0 | DONE | production build 포함 통과 |
| QA-003 | 테스트 | 점수·URL·통합·권한 우선 테스트 | 요청문 | scoring tests | P0 | IN_PROGRESS | 통합·권한 테스트 후속 |
| DOC-001 | 문서 | 요구사항 추적표 유지 | 요청문 | 본 파일 | P0 | DONE | Phase별 갱신 |
| DOC-002 | 문서 | gap/conflict 분석 | 요청문 | `gap-and-conflict-analysis.md` | P0 | DONE | 빈 저장소 기준 |
| DOC-003 | 문서 | Phase 0~6 구현 로드맵 | 요청문 | `implementation-roadmap.md` | P0 | DONE | 위험/완료 기준 포함 |
| DOC-004 | 문서 | 외부 서비스 키·권한·제한·테스트 정리 | 요청문 | `external-services-setup.md` | P0 | DONE | 실제 정책은 연결 전 재확인 |
| DOC-005 | 문서 | UI 충돌 의사결정 기록 | 요청문, UI 24 | `ui-decisions.md` | P1 | DONE | 최초 결정 기록 |
| MVP-001 | 범위 | 커뮤니티·팀·결제·native·확장·공개 API 제외 가능 | DEV 36 | roadmap | P2 | DEFERRED | 명시적 후속 범위 |
| MVP-002 | 범위 | X·초단위 실시간·고급 추천·완성형 Dark·예측 제외 | DEV 36 | roadmap | P2 | DEFERRED | 명시적 후속 범위 |
