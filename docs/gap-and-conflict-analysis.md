# 현재 코드와 요구사항 차이·충돌 분석

## 기준 상태

분석 시작 시 `C:\Project\AI_Trend`는 파일과 Git 메타데이터가 없는 빈 디렉터리였다. 기존 프레임워크, 환경변수, DB 연결, 인증, API, 테스트, 배포 설정, TODO 및 빌드 오류가 없었으므로 보존하거나 마이그레이션할 기존 코드는 없다.

## 주요 차이와 처리

| 영역 | 현재 상태 | 요구 상태 | 판정 | 권장 해결 |
|---|---|---|---|---|
| 저장소 | 빈 디렉터리 | Next.js 기반 확장 가능한 구조 | 충돌 없음 | pnpm workspace로 최소 모노레포 구성 |
| Git | `.git` 없음 | CI·변경 추적 | 제약 | 사용자가 원할 때 Git 초기화, 현재 작업은 파일 생성에 한정 |
| 데이터 | 10개 fixture entity | 6개 채널 live ingestion | 부분 | fixture임을 UI/문서에 표시하고 adapter별 점진 연결 |
| 인증 | 미연결 | Supabase Google OAuth | 외부 의존 | URL/key 구성 후 auth callback과 profile trigger 구현 |
| DB | migration 초안 | 운영 Supabase + RLS | 부분 | staging에서 migration/RLS 테스트 후 적용 |
| Threads | adapter 없음 | 핵심 소셜 채널 | 정책 제약 | Meta 앱 권한·검색 기능의 최신 허용 범위 확인 후 제한을 숨기지 않음 |
| Instagram | adapter 없음 | 보조 hashtag/public media 신호 | 정책 제약 | 공식 Graph API 범위만 사용, 신호 부재는 감점하지 않음 |
| Product Hunt | 미구현 | 핵심 출시 채널 | 미구현 | OAuth token 발급 후 GraphQL adapter/fixture 추가 |
| Reddit | 미구현 | 핵심 커뮤니티 채널 | 미구현 | OAuth·User-Agent·저장 정책 확인 후 adapter 추가 |
| LLM | Gemini 무료 모델 실연결·provider·Zod 검증 완료, UI는 fixture | worker 저장·관리자 재생성 연결 | 부분 | 인증·호출 제한이 있는 worker/admin 경로에서 provider 호출 |
| UI 범위 | 메인·상세·탐색 기반 | 회원·리포트·관리자 포함 | 부분 | 빈/준비 상태를 명확히 표시하며 Phase 5~6에서 연결 |
| 점수 | 입력 component 합산·상태 로직 | percentile/log normalization + Trust | 부분 | snapshot 데이터 확보 후 normalization/anti-spam 구현 |
| worker | collector package 분리 | 독립 장기 실행 프로세스 | 부분 | `apps/worker`와 queue/cron adapter 추가 |
| 배포 | 없음 | Vercel/Supabase/worker | 미구현 | 환경별 secret 및 smoke check 후 연결 |

## 문서 간 해석과 결정

- 개발 기획서는 권장 구조에 `/apps/web`, `/apps/worker`, 다수 패키지를 제시하지만 최초 목표는 기반과 두 collector까지다. 빈 디렉터리에 불필요한 빈 패키지를 모두 만들지 않고 실제 코드가 있는 `web`, `types`, `scoring`, `collectors`부터 생성한다. worker는 collector와 웹이 이미 분리되어 있어 후속 추가가 가능하다.
- 요청문은 Phase 1에서 광범위한 DB 모델을 요구하고 “migration 초안”을 최초 목표로 둔다. 따라서 모든 핵심 테이블과 RLS 초안을 한 migration에 제공하지만 운영 적용 완료로 표시하지 않는다.
- UI 명세는 최신 chart library를 권장하지만 최초 레이아웃 검증은 mock data를 허용한다. 현재 SVG sparkline은 접근 가능한 구조 검증용이며, 실제 다중 시계열은 Recharts/ECharts 연결 후 완료한다.
- Threads는 핵심 채널이나 공식 API 기능과 앱 승인 범위가 변동될 수 있다. 비공식 scraping은 사용하지 않으며 `BLOCKED`로 공개한다.
- Instagram은 “보조 가산점”이므로 수집 장애·미허용 상태가 전체 점수의 감점 원인이 되지 않도록 scoring 상한 항목으로 독립시킨다.
- Gemini는 신규 키에서 `gemini-2.5-flash-lite`가 사용 종료 응답을 반환하므로, 공식 무료 등급과 실연결을 확인한 `gemini-3.1-flash-lite`를 기본값으로 사용한다.

## 보안·운영 위험

- `SUPABASE_SERVICE_ROLE_KEY`, 외부 API token, Gemini/Resend key는 브라우저 번들에 포함되면 안 된다. `NEXT_PUBLIC_` 접두사는 공개 값에만 사용한다.
- 초기 RLS는 설계 초안이다. 실제 Supabase 프로젝트에서 anon/authenticated/service-role별 정책 테스트 없이 운영 배포하면 안 된다.
- 외부 플랫폼 원문·댓글의 보관 범위와 삭제 반영 의무는 정책 변경 가능성이 크다. raw payload 장기 보관 기간을 플랫폼별로 결정해야 한다.
- LLM 출력은 원문을 대체하지 않고 생성 시각·모델·prompt version과 근거를 함께 보관해야 한다.
- fixture 수치를 실제 2026년 플랫폼 수치로 오해하지 않도록 현재 화면은 “수집 구조 검증용 데이터”로 README에 명시한다.
- 자동 점수의 조작 내성을 높이기 전에는 Trust Score와 부분 데이터 표시를 제거하지 않는다.

## 대규모 변경 기록

기존 코드가 없으므로 삭제나 구조 변경은 수행하지 않았다. 최초 구조는 서비스 경계(웹/타입/점수/수집)를 분리하여 이후 worker 및 provider를 추가할 때 UI를 재작성하지 않도록 선택했다.
