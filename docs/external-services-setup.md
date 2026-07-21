# 외부 서비스 설정

API 정책과 quota는 변동되므로 실제 연결 직전에 각 공식 문서를 다시 확인한다. 비공식 scraping이나 브라우저 세션 재사용을 collector의 운영 방식으로 채택하지 않는다.

| 서비스 | 환경변수 | 설정·권한 | callback / 범위 | 호출 제한 | 현재 상태 | 테스트 |
|---|---|---|---|---|---|---|
| Supabase | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | 프로젝트 생성, migration, RLS | Auth callback은 로컬/preview/prod URL 등록 | 플랜별 DB/Auth quota 확인 | BLOCKED | staging migration + anon/auth/admin RLS matrix |
| Google OAuth | Supabase dashboard + Google client secret | OAuth consent screen, 최소 profile/email | `https://<project-ref>.supabase.co/auth/v1/callback` 및 앱 redirect allowlist | Google/Supabase 정책 확인 | BLOCKED | 신규/기존 사용자, 취소, callback mismatch |
| GitHub | `GITHUB_TOKEN` 선택 | fine-grained token 또는 무인증 public REST | read-only repository metadata | REST search/core rate limit header를 실행별 저장 | CONNECTED | 30건 DB 저장, 재수집 0 insert/30 update 확인 |
| Hacker News | 없음 | Algolia HN Search 공개 API | read-only story search | 공식 SLA가 아니므로 보수적 retry/cache | CONNECTED | 50건 DB 저장, 누락 URL fallback·재수집 멱등성 확인 |
| Product Hunt | `PRODUCT_HUNT_TOKEN` | Product Hunt developer token, GraphQL scope/상업 사용 확인 | server-only | 최신 API rate policy 확인 | NOT_STARTED | fixture → sandbox/live pagination |
| Reddit | `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET` | OAuth app, 식별 가능한 User-Agent, subreddit read | server OAuth | 최신 Data API terms, quota, 보관/삭제 정책 확인 | NOT_STARTED | 승인된 test app + 429/삭제 fixture |
| Threads | `THREADS_ACCESS_TOKEN` | Meta app, Threads API 권한과 검수 | Meta OAuth callback | 검색/keyword discovery의 실제 허용 범위와 quota 확인 | BLOCKED | 허용된 test account/endpoint만 사용 |
| Instagram | `INSTAGRAM_ACCESS_TOKEN` | Meta app, Instagram Graph API, 허용 public/hashtag media scope | Meta OAuth callback | hashtag query/Business 계정/검수 제한 확인 | BLOCKED | approved business test account, no-signal case |
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
