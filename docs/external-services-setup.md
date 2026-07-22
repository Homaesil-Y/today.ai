# 외부 서비스 설정

API 정책과 quota는 변동되므로 실제 연결 직전에 각 공식 문서를 다시 확인한다. 비공식 scraping이나 브라우저 세션 재사용을 collector의 운영 방식으로 채택하지 않는다.

| 서비스 | 환경변수 | 설정·권한 | callback / 범위 | 호출 제한 | 현재 상태 | 테스트 |
|---|---|---|---|---|---|---|
| Supabase | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | 프로젝트 생성, migration, RLS | Auth callback은 로컬/preview/prod URL 등록 | 플랜별 DB/Auth quota 확인 | BLOCKED | staging migration + anon/auth/admin RLS matrix |
| Google OAuth | Supabase dashboard + Google client secret | OAuth consent screen, 최소 profile/email | `https://<project-ref>.supabase.co/auth/v1/callback` 및 앱 redirect allowlist | Google/Supabase 정책 확인 | BLOCKED | 신규/기존 사용자, 취소, callback mismatch |
| GitHub | `GITHUB_TOKEN` 선택 | fine-grained token 또는 무인증 public REST | read-only repository metadata | REST search/core rate limit header를 실행별 저장 | CONNECTED | 30건 DB 저장, 재수집 0 insert/30 update 확인 |
| Hacker News | 없음 | Algolia HN Search 공개 API | read-only story search | 공식 SLA가 아니므로 보수적 retry/cache | CONNECTED | 50건 DB 저장, 누락 URL fallback·재수집 멱등성 확인 |
| Product Hunt | `PRODUCT_HUNT_TOKEN` | Product Hunt developer token(무료·무기한), GraphQL v2 | server-only, `Authorization: Bearer` | 복잡도 기반 15분당 6250점, `X-Rate-Limit-*` 헤더 저장 | ADAPTER_READY (토큰 대기) | fixture·pagination·rate-limit·GraphQL 오류·토큰 미설정 blocked 단위 테스트 통과 |
| Reddit | `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET` | OAuth app(client credentials), 식별 가능한 User-Agent | server OAuth, app-only 토큰 | 인증 클라이언트 100 QPM, `X-Ratelimit-*` 헤더 저장 | ADAPTER_READY (자격증명 대기) | fixture·auth+pagination·rate-limit·자격증명 미설정 blocked 단위 테스트 통과 |
| Threads | `THREADS_ACCESS_TOKEN` | Meta app + `threads_keyword_search` **App Review**(advanced access) 필요. 타인 공개글 검색은 검수 승인 후 가능 | Meta OAuth callback | keyword_search는 무료·rate-limited, 검수 2~4주+비즈니스 인증 | BLOCKED (앱 검수 대기) | 검수 승인 후 어댑터 구현 예정. 전제조건 /privacy·/terms는 배포 완료 |
| Instagram | `INSTAGRAM_ACCESS_TOKEN` | Meta app + Business/Creator 계정 + FB 페이지 + "Instagram Public Content Access" **App Review** | Meta OAuth callback | 해시태그 검색 주당 30개 제한, 검수 4~6주+ | BLOCKED (앱 검수 대기) | 보조 가산 신호. 검수 승인 후 어댑터 구현 예정 |
| Gemini | `GEMINI_API_KEY`, `GEMINI_MODEL` | server-side 무료 등급 key, `gemini-3.1-flash-lite` | callback 없음 | 무료 등급 RPM/TPM/RPD와 데이터 개선 사용 정책 확인 | CONNECTED | 실연결 structured output + schema-invalid/rate-limit fixture |
| Resend | `RESEND_API_KEY`, `EMAIL_FROM` | 발신 domain DNS 검증 | webhook은 추후 delivery status용 | 플랜별 email quota 확인 | BLOCKED | test recipient, idempotency, bounce |

## 발급·운영 원칙

1. `.env.example`을 `.env.local`로 복사하고 실제 secret은 커밋하지 않는다.
2. `NEXT_PUBLIC_`에는 공개 가능한 URL과 anon key만 둔다. service role과 플랫폼 token은 server/worker에만 둔다.
3. 각 collector는 fixture 모드로 credential 없이 테스트할 수 있어야 하며 live 모드 실패를 성공으로 위장하지 않는다.
4. 429/5xx, quota 잔여량, parsing 오류와 last collected time을 `collector_runs`에 기록한다.
5. 원문 본문·댓글·작성자 식별자의 저장 기간은 플랫폼 약관과 개인정보 보관 정책 검토 후 확정한다.
6. callback URL은 localhost, preview, production을 각각 명시적으로 allowlist한다.
7. collector는 `SUPABASE_SECRET_KEY` 또는 legacy `SUPABASE_SERVICE_ROLE_KEY`만 사용한다. `202607200003_collector_service_role_grants.sql`은 `sources`, `raw_items`, `collector_runs`에 필요한 최소 권한만 부여한다.

## Product Hunt developer token 발급

`ProductHuntCollector`는 어댑터·fixture·테스트·저장·후보 변환까지 완성되어 있고, 실제 live 호출만 토큰이 없어 blocked 상태다. 무료 developer token만 있으면 즉시 라이브 수집이 시작된다.

1. https://www.producthunt.com 에 로그인한다.
2. https://api.producthunt.com/v2/oauth/applications 로 이동한다. (Product Hunt 우측 상단 프로필 → **API Dashboard**)
3. **Add an application**(또는 **New Application**)을 눌러 앱을 만든다. Redirect URI는 서버 전용 수집이라 임의값(예: `https://oh-ai-news.vercel.app`)을 넣어도 된다.
4. 생성된 앱 상세 화면에서 **Developer Token**(또는 **Create Token**) 값을 복사한다. 이 토큰은 만료되지 않는 계정 연동 read 토큰이다.
5. 이 값을 다음 두 곳에 넣는다.
   - 로컬 `.env.local`의 `PRODUCT_HUNT_TOKEN=`
   - GitHub 저장소 → **Settings → Secrets and variables → Actions → New repository secret** 에 이름 `PRODUCT_HUNT_TOKEN`, 값은 복사한 토큰.
6. 토큰 등록 후 `scheduled trend pipeline` 워크플로가 다음 6시간 주기 또는 수동 실행에서 Product Hunt를 함께 수집한다. 토큰이 없으면 수집기는 실패가 아니라 경고와 함께 0건 blocked로 기록된다.

## Reddit OAuth 자격증명 발급

`RedditCollector`도 어댑터·fixture·테스트·후보 변환까지 완성되어 있고, client credentials(app-only) 흐름으로 read-only 수집을 한다.

1. https://www.reddit.com 에 로그인한다.
2. https://www.reddit.com/prefs/apps 로 이동해 **create another app...**(또는 **are you a developer? create an app...**)을 누른다.
3. 앱 유형은 **script**를 선택한다. name은 임의, redirect uri는 `http://localhost:8080` 등 아무 값이나 넣는다.
4. 생성 후 앱 카드에서 이름 아래의 문자열이 **client id**, `secret` 항목이 **client secret**이다.
5. 이 값을 다음 두 곳에 넣는다.
   - 로컬 `.env.local`의 `REDDIT_CLIENT_ID=`, `REDDIT_CLIENT_SECRET=`
   - GitHub → **Settings → Secrets and variables → Actions** 에 `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET` 두 secret으로 등록.
6. Reddit은 식별 가능한 User-Agent를 요구한다. 수집기는 기본 User-Agent를 사용하지만, 운영에서 문제가 생기면 `RedditCollectorConfig.userAgent`로 조직명을 포함한 값을 지정한다. 자격증명이 없으면 수집기는 실패가 아니라 경고와 함께 0건 blocked로 기록된다.
