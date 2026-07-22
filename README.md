# AI Trend Radar

Product Hunt, GitHub, Hacker News, Reddit, Threads의 신규 AI 서비스를 통합하고 Instagram의 대중 확산 신호를 보조적으로 확인해 “오늘 뜨는 AI 서비스”를 설명하는 트렌드 인텔리전스 플랫폼입니다.

현재 GitHub·Hacker News 실데이터 수집, Trend Score 계산, Gemini 한국어 분석, Supabase 저장, Google 로그인, 관리자 승인·공개, 공개 TOP 10과 서비스 상세 화면이 연결되어 있습니다. SEO·GEO·AEO 구조화 데이터와 공유 이미지, 실제 통합 검색·탐색 필터·카테고리, 관심 목록 폴더·메모·점수 비교·온보딩·개인 설정도 연결되어 있습니다. 공개 화면은 관리자가 승인한 실제 데이터만 표시합니다.

## 요구 환경

- Node.js 22 이상(개발 환경은 24.16.0)
- pnpm 11.9 이상

## 설치와 실행

```bash
pnpm install
copy .env.example .env.local
pnpm dev
```

브라우저에서 `http://localhost:3000`을 엽니다. 실데이터 연결에는 `.env.example`에 정리된 Supabase·Gemini 설정이 필요합니다.

## 품질 검사

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

한 번에 실행하려면 `pnpm check`를 사용합니다.

## 수집기 실행

기본 fixture 모드:

```bash
pnpm collect:github
```

PowerShell live 모드:

```powershell
$env:COLLECTOR_MODE='live'
$env:GITHUB_TOKEN='<token>'
pnpm collect:github
```

GitHub token은 선택 사항이지만 rate limit 때문에 권장합니다. secret은 커밋하지 마세요.

## 구조

```text
apps/web                 Next.js 공개 사용자 화면
packages/types           플랫폼 독립 데이터 계약
packages/scoring         URL 정규화, 점수·상태 결정 로직
packages/collectors      공통 Collector와 GitHub/HN adapter
supabase/migrations      PostgreSQL/RLS 초안
docs                     요구사항 추적·분석·로드맵·운영 설정
```

다음 단계는 독립 worker 배포, Product Hunt/Reddit/Threads/Instagram adapter, 데일리 리포트·이메일, 계정 탈퇴와 개인정보 화면입니다. 사용 불가능한 외부 연동은 fixture로 감추지 않고 추적표에서 `BLOCKED` 또는 `NOT_STARTED`로 표시합니다.

## Supabase와 Google OAuth

1. Supabase staging project를 생성합니다.
2. `supabase/migrations/202607190001_initial_schema.sql`을 검토·적용합니다.
3. Google OAuth provider와 callback URL을 설정합니다.
4. `.env.local`에 public URL/Publishable Key를, server 환경에 service role key를 설정합니다.
5. anon/auth/admin RLS 테스트를 수행한 뒤 운영에 적용합니다.

상세한 키와 정책 확인 항목은 [외부 서비스 설정](docs/external-services-setup.md), [SEO·GEO·AEO 기준](docs/seo-geo-aeo.md), 구현 상태는 [요구사항 추적표](docs/requirements-traceability.md), 단계별 작업은 [구현 로드맵](docs/implementation-roadmap.md)을 참고하세요.

## 현재 외부 연결 상태

| 서비스 | 상태 |
|---|---|
| GitHub | live 수집·Supabase 저장 완료 |
| Hacker News | live 수집·Supabase 저장 완료 |
| Product Hunt / Reddit | adapter 미구현 |
| Threads / Instagram | 공식 앱 권한과 허용 범위 확인 필요 |
| Supabase / Google OAuth | 실연결 완료 |
| Gemini | 무료 우선 모델로 한국어 분석 연결 완료 |
| Resend | 미연결 |

## 무료 우선 자동 실행

`.github/workflows/scheduled-pipeline.yml`은 GitHub Actions에서 수집·점수 계산을 6시간마다 실행하고, 한국 시간 오전 7시 30분에 Gemini 분석을 최대 3건 실행합니다. 저장소 Secrets에 아래 세 값을 등록하면 수동 실행과 예약 실행을 사용할 수 있습니다.

Gemini 분석이 저장된 검토 후보는 기본적으로 자동 공개됩니다. 수동 승인 방식으로 되돌리려면 실행 환경에서 `AUTO_APPROVE_ANALYZED=false`로 설정하세요. 분석 실패·미분석 후보는 자동 공개되지 않습니다.

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SECRET_KEY`
- `GEMINI_API_KEY`
