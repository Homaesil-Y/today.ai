# 구현 로드맵

각 Phase의 상태는 `docs/requirements-traceability.md`와 함께 갱신한다. 테스트 명령은 특별한 경우가 없으면 `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`를 포함한다.

## Phase 0. 기반 정비

- 작업: pnpm workspace, Next.js/TypeScript strict, semantic design token, 공통 타입, 환경변수 schema, Supabase 연결 helper, Google OAuth callback, CI.
- 선행 조건: Node 22+, pnpm 11. Supabase·Google 연결에는 프로젝트와 key가 필요하다.
- 파일: 루트 설정, `apps/web`, `packages/types`, `.env.example`, `.github/workflows/ci.yml`.
- 테스트: 모든 품질 명령, `.env` 누락 오류, 공개/서버 env 경계, 360/768/1440px 시각 QA.
- 완료 조건: 깨끗한 설치에서 앱 실행, strict typecheck/build/lint/test 통과, Light App Shell이 모든 breakpoint에서 사용 가능.
- 외부 의존성: Supabase URL/anon key, Google OAuth client.
- 위험: Next/React 보안 패치, callback URL 불일치, RLS 오구성.

## Phase 1. 데이터 모델

- 작업: sources, raw item, entity, alias, mention, metric snapshot, score, AI analysis, profile/preferences, watchlist, report, notification, collector run migration 및 seed.
- 선행 조건: Supabase staging project, RLS 테스트 계정.
- 파일: `supabase/migrations/*`, `supabase/seed/*`, 향후 `packages/db`.
- 테스트: clean migration/rollback rehearsal, FK/unique/check constraint, anon/auth/admin RLS matrix, UTC timestamp.
- 완료 조건: 모든 핵심 테이블이 staging에 적용되고 비로그인 공개 데이터와 사용자 소유 데이터가 정책대로 분리됨.
- 외부 의존성: Supabase CLI/project.
- 위험: policy recursion, service-role 과사용, raw payload 보존 정책.

## Phase 2. 수집기

- 작업: 공통 `Collector` 계약, GitHub/HN/Product Hunt/Reddit/Threads/Instagram adapter, fixture, retry/backoff, rate-limit metadata, collector run persistence.
- 선행 조건: Phase 1 raw/collector tables, 플랫폼별 공식 credential.
- 파일: `packages/collectors`, `apps/worker`, platform fixtures.
- 테스트: Zod invalid response, pagination, 429/5xx retry, abort, idempotent upsert, fixture snapshot.
- 완료 조건: 6개 adapter가 동일 계약을 따르고 실행 결과·오류·호출량을 기록. 사용할 수 없는 기능은 명시적 `blocked/partial`로 반환.
- 외부 의존성: 플랫폼 token과 필요한 앱 승인.
- 위험: API 변경, 검색 기능 제한, 호출량, 삭제된 원문 보존.

## Phase 3. 정규화와 분석

- 작업: URL canonicalization, AI relevance filter, candidate extraction, entity matching/merge, metric snapshots, percentile/log normalization, Trend/Trust/status, LLM provider/schema/prompts.
- 선행 조건: 최소 7일 수집 데이터, 관리자 검수 기준.
- 파일: `packages/scoring`, 향후 `packages/utils`, `packages/llm`, worker jobs, `docs/scoring.md`, `docs/prompts.md`.
- 테스트: URL edge cases, 동일 entity fixture, false merge, score golden cases, same input reproducibility, LLM hallucination/schema rejection.
- 완료 조건: 교차 채널 entity와 시간대별 변화가 재현 가능하게 계산되고 근거 없는 LLM 출력은 저장되지 않음.
- AI 분석 대기열(2026-07-22, 2026-08-07 개정): 3시간마다 실행당 최대 50건 순차 분석. 우선순위는 (1) 한 번도 분석되지 않은 후보(점수순) → (2) 72시간이 지난 재분석 대상(가장 오래된 것부터) 순이며, 관리자가 보류(private)한 후보는 제외한다. 결과 JSON에 `analysisQueue`(unanalyzed/stale/selected/remaining)와 `lastRateLimitAt`을 기록한다. 근거: 점수순 정렬만으로는 오래된 public 재분석이 미분석 review 후보를 밀어낼 수 있었고, 재분석까지 점수순이면 처리량 부족 시 꼬리가 영영 굶는다(실측: 공개의 25%가 5일+ 방치). 재분석 주기 24→72시간은 필요 처리량(공개 수/일)을 처리 능력(76~145건/일) 안으로 맞추기 위함 — 재분석은 요약 텍스트만 갱신하며 순위·점수는 LLM 없이 매 실행 갱신된다.
- 외부 의존성: Gemini API 또는 대체 provider.
- 위험: 동명이인 오병합, 신규 서비스 cold start, 조작된 소셜 신호, 비용 급증.

## Phase 4. 사용자 화면

- 현재 상태(2026-07-22): 공개 TOP10·탐색·상세, 실제 통합 검색, 기간·카테고리·채널·신뢰도 필터와 정렬, 카테고리 허브, SEO/GEO/AEO 메타데이터, JSON-LD, 동적 OG, sitemap, robots, llms.txt, 방법론 페이지까지 구현. Gemini 분석은 3시간마다 실행당 최대 50건을 시도하고 무료 할당량 도달 시 안전하게 중단한 뒤 다음 주기에 재개한다. 실제 다중 시계열 차트는 후속.

- 작업: App Shell, 오늘의 레이더, TOP3/TOP10, 탐색/필터, 카테고리, 상세, 검색, 실제 chart, 모든 데이터 상태, SEO/OG.
- 선행 조건: stable query/API contract, fixture와 live data의 동일 shape.
- 파일: `apps/web/src/app`, `components`, `data`, route handlers.
- 테스트: component/unit, keyboard, axe/Lighthouse, 360/768/1024/1440px, loading/empty/error/partial/stale snapshots.
- 완료 조건: 비로그인 사용자가 모바일/데스크톱에서 TOP10과 상세 근거를 확인하고 모든 상태에서 복구 행동을 이해함.
- 외부 의존성: Supabase public queries, official logo policy.
- 위험: 높은 정보 밀도의 모바일 가독성, chart 성능, 잘못된 fixture 노출.

## Phase 5. 회원 기능

- 현재 상태(2026-07-22): Google OAuth 운영 연결, 로그인 후 원래 경로 복귀, 한 화면 온보딩, 관심 카테고리·알림 설정, 관심 목록 저장·삭제·폴더·이동·메모·저장 당시 점수 비교 구현. 회원 API 역할은 RLS와 별도로 최소 SQL grant를 명시. 탈퇴·데이터 삭제는 후속.

- 작업: Google OAuth, profile trigger, 3단계 이내 onboarding, 관심 category, watchlist/folder/memo, alert preferences.
- 선행 조건: OAuth/RLS 검증, privacy/terms content.
- 파일: auth routes/middleware, account pages, Supabase client/server helpers.
- 테스트: 로그인/로그아웃/callback 오류, unauth locked state, optimistic rollback, 소유권 교차 접근 거부.
- 완료 조건: Google 사용자만 인증되고 본인 데이터만 CRUD 가능하며 공개 영역은 로그인 없이 유지.
- 외부 의존성: Google Cloud/Supabase Auth.
- 위험: redirect 공격, session cookie 오용, 탈퇴 데이터 삭제 누락.

## Phase 6. 리포트와 관리자

- 작업: daily report, Resend email, collector dashboard, candidate review, merge/split, keyword/channel/score settings, error log, LLM regeneration.
- 선행 조건: 안정된 pipeline, admin audit model, verified sending domain.
- 파일: report/email providers, admin routes/pages, scheduled jobs.
- 테스트: 08:00 timezone scheduling, idempotent email, admin API denial, merge audit/rollback, platform outage scenario.
- 완료 조건: 운영자가 수집·분류·병합·점수·오류를 서버 권한 하에서 제어하고 daily report가 중복 없이 발송됨.
- 외부 의존성: Resend, scheduler/worker host.
- 위험: 권한 상승, 잘못된 대량 병합, 중복 이메일, 장기 job timeout.

## 후속 고도화

주·월간 리포트, 서비스 비교 완성, 개인화 추천, 조작 탐지 고도화, 국내 사업화 분석, Dark theme, Telegram/Slack, 예측 모델은 MVP 완료 후 수행한다. X, 결제, native app, browser extension, public API는 별도 제품 결정이 있기 전까지 `DEFERRED`다.
