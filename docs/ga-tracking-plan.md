# GA4 이벤트 추적 개발 계획 (GTM 기반)

- 작성일: 2026-07-24
- 전제: GTM 컨테이너(`GTM-WP6FQ3HK`)는 이미 설치됨(PR #70). GA4 태그는 GTM 콘솔에서 연결.
- 이 문서는 **개발 계획서**다. 구현자는 각 Phase를 순서대로 작업하고, 이벤트 표를 그대로 코드/GTM에 옮기면 된다.

---

## 0. 측정 전략 요약

- **무엇을 측정하나**: 이 서비스의 핵심 지표는 ① 탐색 깊이(목록→상세 전환), ② 저장 행동(관심 등록 = 재방문 의도), ③ 아웃바운드(공식 사이트/GitHub/뉴스 원문 클릭 = 서비스가 실제 가치를 전달한 순간), ④ 로그인 퍼널.
- **어떻게 보내나**: 코드는 GA를 직접 호출하지 않는다. **`window.dataLayer.push()`만** 한다. GA4 연결·매개변수 매핑은 전부 GTM 콘솔에서 처리 → 코드 재배포 없이 태그 운영 가능.
- **명명 규칙**: GA4 관례인 `snake_case`. GA4 권장 이벤트가 있으면 그 이름을 그대로 사용(`search`, `login`, `select_content`). 커스텀은 `동사_목적어` 형태(`save_watchlist`, `click_outbound`).

---

## 1. 공통 인프라 (Phase 1 — 선행 필수)

### 1-1. SPA page_view 처리
Next App Router는 소프트 내비게이션 시 전체 페이지 로드가 없어 **GTM 기본 page_view가 라우트 전환을 못 잡는다.**

- **작업**: 클라이언트 컴포넌트 `AnalyticsPageView` 신설.
  - `usePathname()` + `useSearchParams()` 변화를 감지해 `dataLayer.push({ event: "page_view", page_path, page_title })`.
  - `layout.tsx`의 `<body>`에 1회 마운트. `<Suspense>`로 감쌀 것(useSearchParams 요구사항).
- **GTM 측 작업**: GA4 구성 태그의 트리거를 "초기화 - 모든 페이지" + 커스텀 이벤트 `page_view`로 설정하고, GA4 태그의 자동 page_view 수집은 중복 방지를 위해 끈다(또는 History Change 트리거만 쓰는 방식 중 택1 — 코드 push 방식 권장: page_title을 정확히 실을 수 있음).

### 1-2. 클릭 이벤트 전달 방식: `data-ga-*` 위임 리스너 (핵심 설계 결정)
이 앱은 대부분 **서버 컴포넌트**라 요소마다 `onClick`을 달려면 클라이언트 컴포넌트로 바꿔야 한다(비용·리스크 큼). 대신:

- **작업**: 클라이언트 컴포넌트 `AnalyticsClickListener` 신설 — `document`에 클릭 위임 리스너 1개.
  - 클릭된 요소에서 `closest("[data-ga-event]")`를 찾아 `data-ga-event` 값과 `data-ga-*` 속성 전부를 params로 `dataLayer.push`.
  - 예: `<a data-ga-event="click_outbound" data-ga-target="official_site" data-ga-service="klaatcode" ...>`.
- **효과**: 서버 컴포넌트는 **HTML 속성만 추가**하면 추적된다. 구현 작업의 90%가 "속성 붙이기"로 단순화됨.
- 이미 클라이언트인 컴포넌트(WatchButton, Dropdown, CompareAddForm 등)는 상태를 알아야 정확하므로 직접 `trackEvent()` 호출.

### 1-3. 유틸
- **작업**: `apps/web/src/lib/analytics.ts` 신설.
  ```ts
  export function trackEvent(event: string, params?: Record<string, string | number | boolean>) {
    if (typeof window === "undefined") return;
    (window as any).dataLayer = (window as any).dataLayer || [];
    (window as any).dataLayer.push({ event, ...params });
  }
  ```
- SSR 안전 가드 필수. 콘솔 오류가 나도 앱 동작에 영향 없도록 try/catch는 불필요(push는 실패하지 않음)하되 window 가드는 필수.

### 1-4. 공통 매개변수
모든 이벤트에 가능하면 포함:
| param | 값 | 예 |
|---|---|---|
| `page_type` | home / explore / service_detail / news / compare / watchlist / reports / settings | 어떤 화면에서 발생했나 |
| `service_slug` | 서비스 관련 이벤트일 때 | `klaatcode` |
| `service_category` | 〃 | `개발·코딩` |
| `position` | 목록 내 순위/인덱스 | `3` |

---

## 2. 페이지·요소별 이벤트 명세 (Phase 2~3)

> P1 = 핵심 지표(먼저), P2 = 보조, P3 = 나중에 해도 됨.

### 2-1. 전역 (모든 페이지) — Phase 2
| 요소 | 트리거 | 이벤트명 | 매개변수 | 우선순위 | 구현 방식 |
|---|---|---|---|---|---|
| 헤더 통합 검색 | 폼 제출 | `search` | `search_term`, `search_source: "header"` | **P1** | 폼에 submit 핸들러 필요 → 소형 클라이언트 래퍼 또는 data-ga + submit 위임 |
| 사이드바/모바일 내비 링크 | 클릭 | `select_content` | `content_type: "nav"`, `item_id: 링크 라벨` | P2 | data-ga |
| 모바일 더보기 시트 열기 | 클릭 | `open_more_menu` | — | P3 | 이미 클라이언트(app-nav) → trackEvent |
| 맨 위로 FAB | 클릭 | `click_back_to_top` | — | P3 | 이미 클라이언트 → trackEvent |
| 푸터 링크 | 클릭 | `select_content` | `content_type: "footer"`, `item_id` | P3 | data-ga |
| 로그인 버튼(헤더) | 클릭 | `login_start` | `method: "google"`, `trigger: "header"` | **P1** | data-ga |

### 2-2. 홈 `/` — Phase 2
| 요소 | 트리거 | 이벤트명 | 매개변수 | 우선순위 |
|---|---|---|---|---|
| Top1 카드 "분석 보기" | 클릭 | `select_content` | `content_type: "trend_card"`, `service_slug`, `position: 1` | **P1** |
| Top2·3 카드 "분석 보기" | 클릭 | 〃 | `position: 2/3` | **P1** |
| 랭킹 행 클릭(표·모바일 카드) | 클릭 | `select_content` | `content_type: "ranking_row"`, `service_slug`, `position` | **P1** |
| 관심 등록(홈 카드/행) | 저장 성공 | `save_watchlist` | `service_slug`, `saved: true/false`(해제 구분), `trigger_page` | **P1** |
| "필터·정렬로 전체 탐색" | 클릭 | `select_content` | `content_type: "cta"`, `item_id: "explore_from_home"` | P2 |
| FAQ 방법론 링크 | 클릭 | `select_content` | `item_id: "methodology"` | P3 |

### 2-3. 트렌드 탐색 `/explore` — Phase 2
| 요소 | 트리거 | 이벤트명 | 매개변수 | 우선순위 |
|---|---|---|---|---|
| 검색/필터 "적용" | 폼 제출 | `search` | `search_term`, `search_source: "explore"`, `filter_period`, `filter_category`, `filter_source`, `filter_trust`, `sort` | **P1** |
| 필터 "초기화" | 클릭 | `reset_filters` | — | P2 |
| 랭킹 행 클릭 | 클릭 | `select_content` | (홈과 동일 스키마, `page_type: "explore"`) | **P1** |
| 관심 등록 | 저장 성공 | `save_watchlist` | 〃 | **P1** |
| 페이지네이션 | 클릭 | `paginate` | `page_to`, `list: "explore"` | P2 |
| 결과 0건 표시 | 렌더 시 | `view_no_results` | `search_term` | P2 — 서버 렌더라 AnalyticsPageView에서 page_view param(`results_count`)로 싣는 방식 권장 |

### 2-4. 서비스 상세 `/services/[slug]` — Phase 2 (아웃바운드가 이 페이지의 핵심)
| 요소 | 트리거 | 이벤트명 | 매개변수 | 우선순위 |
|---|---|---|---|---|
| "공식 사이트" | 클릭 | `click_outbound` | `target: "official_site"`, `service_slug`, `link_url` | **P1** |
| "GitHub" | 클릭 | `click_outbound` | `target: "github"`, 〃 | **P1** |
| "비교하기" | 클릭 | `add_to_compare` | `service_slug`, `trigger: "detail"` | P2 |
| "관심 등록" | 저장 성공 | `save_watchlist` | 〃 | **P1** |
| 기간 탭(24H/7D/30D/90D) | 클릭 | `select_period` | `period`, `service_slug` | P3 — TrendPeriodChart는 이미 클라이언트 |
| 주요 출처 행 | 클릭 | `click_outbound` | `target: "source"`, `source_channel`, `service_slug` | P2 |

### 2-5. AI 뉴스 `/news` — Phase 2
| 요소 | 트리거 | 이벤트명 | 매개변수 | 우선순위 |
|---|---|---|---|---|
| 뉴스 제목/원문 링크 | 클릭 | `click_outbound` | `target: "news_article"`, `news_source`(매체명), `position` | **P1** |
| 뉴스 검색 | 폼 제출 | `search` | `search_term`, `search_source: "news"` | P2 |
| 페이지네이션 | 클릭 | `paginate` | `page_to`, `list: "news"` | P2 |

### 2-6. 서비스 비교 `/compare` — Phase 3
| 요소 | 트리거 | 이벤트명 | 매개변수 | 우선순위 |
|---|---|---|---|---|
| "추가" | 서비스 추가 | `add_to_compare` | `service_slug`, `compare_count`(추가 후 개수), `trigger: "compare_page"` | P2 — CompareAddForm은 클라이언트 → trackEvent |
| 열 제거(X) | 클릭 | `remove_from_compare` | `service_slug` | P3 |
| 비교표 내 서비스명 | 클릭 | `select_content` | `content_type: "compare_column"`, `service_slug` | P3 |

### 2-7. 관심 목록 `/watchlist` — Phase 3 (로그인 사용자 행동)
| 요소 | 트리거 | 이벤트명 | 매개변수 | 우선순위 |
|---|---|---|---|---|
| 폴더 생성 | 액션 성공 | `create_folder` | — | P3 — useActionState 성공 분기에서 trackEvent |
| 폴더 이동/메모 저장 | 액션 성공 | `update_watchlist_entry` | `has_memo: bool` | P3 |
| 빈 폴더 삭제 | 액션 성공 | `delete_folder` | — | P3 |
| 비로그인 안내의 "Google 로그인" | 클릭 | `login_start` | `trigger: "watchlist_gate"` | **P1** |

### 2-8. 로그인 퍼널 — Phase 2 (**P1 전체**)
| 요소 | 트리거 | 이벤트명 | 매개변수 | 우선순위 |
|---|---|---|---|---|
| /login "Google로 계속하기" | 클릭 | `login_start` | `method: "google"`, `trigger: "login_page"` | **P1** — GoogleLoginButton은 클라이언트 → trackEvent |
| 로그인 완료 | auth 콜백 후 첫 page_view | `login` | `method: "google"` | **P1** — 콜백 리다이렉트에 `?login=1` 부여 → AnalyticsPageView가 감지·push 후 파라미터 제거(기존 Toast의 clearParam 패턴 재사용) |
| 온보딩 완료 | 제출 성공 | `complete_onboarding` | `categories_count` | P2 — 동일 패턴(`?onboarded=1`) |
| "로그인 없이 둘러보기" | 클릭 | `skip_login` | — | P2 |
| 로그아웃 | 클릭 | `logout` | — | P3 — SignOutButton은 클라이언트 |

### 2-9. 리포트 `/reports`, `/reports/[date]` — Phase 3
| 요소 | 트리거 | 이벤트명 | 매개변수 | 우선순위 |
|---|---|---|---|---|
| 리포트 카드 | 클릭 | `select_content` | `content_type: "report"`, `item_id: 날짜` | P3 |
| 리포트 내 서비스 링크 | 클릭 | `select_content` | `content_type: "report_rank"`, `service_slug`, `position` | P3 |

### 2-10. 설정/계정 — Phase 3
| 요소 | 트리거 | 이벤트명 | 매개변수 | 우선순위 |
|---|---|---|---|---|
| 설정 저장 | `?saved=1` 감지 | `save_preferences` | `daily_digest: bool`, `surge_alert: bool` | P3 |
| 회원 탈퇴 완료 | `/?goodbye=1` 감지 | `delete_account` | — | P3 |

### 측정 제외 (의도적)
- **관리자 화면(/admin/*)**: 운영자 행동은 지표 오염 → `page_type: "admin"`으로 표시만 하고 GA4 보고서에서 필터 제외, 또는 이벤트 자체를 안 쏨(권장: 안 쏨).
- 개인 식별 정보(이메일, 메모 내용, 사용자 ID)는 **어떤 이벤트에도 싣지 않는다**. slug·카운트·불리언만.

---

## 3. 구현 순서 (Phase별 작업 지시)

### Phase 1 — 인프라 (0.5일)
1. `lib/analytics.ts` (`trackEvent`)
2. `components/analytics-page-view.tsx` (SPA page_view + `?login=1` 류 상태 파라미터 감지)
3. `components/analytics-click-listener.tsx` (data-ga-* 위임)
4. `layout.tsx`에 2·3 마운트
5. **검증**: dev에서 라우트 이동 시 `dataLayer`에 page_view 쌓이는지 콘솔 확인. GTM Preview 모드로 이벤트 수신 확인.

### Phase 2 — P1 이벤트 (1일)
1. `save_watchlist` — WatchButton(클라이언트)의 성공 분기에 trackEvent. compact/일반 공용이므로 한 곳 수정으로 전 화면 커버.
2. `click_outbound` — 상세 페이지 공식 사이트/GitHub/출처 행, 뉴스 원문 링크에 data-ga 속성.
3. `select_content`(목록→상세) — RankingTable 행(표+모바일 카드), Top 카드에 data-ga 속성.
4. `search` — 헤더/탐색/뉴스 폼. GET 폼이라 제출 시 페이지 이동 → **제출 순간 push가 유실될 수 있음**. 대안: 이동 후 AnalyticsPageView가 `?q=` 존재를 보고 `search`를 쏘는 방식 권장(유실 0, 코드도 한 곳).
5. `login_start`/`login` 퍼널.
6. **검증**: GTM Preview로 각 이벤트+매개변수 확인 → GA4 DebugView 확인.

### Phase 3 — P2·P3 이벤트 (0.5~1일)
- 비교/관심목록/리포트/설정/페이지네이션/내비 등 나머지 표 항목.

### GTM 콘솔 측 작업 (코드와 병행, 운영자)
1. GA4 구성 태그(측정 ID) 생성, 트리거 = 커스텀 이벤트 `page_view`.
2. 각 커스텀 이벤트별 GA4 이벤트 태그 + 데이터 영역 변수(`search_term`, `service_slug` 등) 등록.
3. GA4 관리 → 맞춤 정의에 `service_slug`, `page_type` 등 커스텀 측정기준 등록(보고서에서 쓰려면 필수).
4. 전환 지정: `save_watchlist`, `click_outbound`, `login`.

---

## 4. 수용 기준 (구현 완료 판정)
- [ ] 라우트 이동(소프트 내비 포함) 시마다 page_view 1회, 중복 없음
- [ ] GTM Preview에서 P1 이벤트 6종(search / select_content / save_watchlist / click_outbound / login_start / login)이 올바른 매개변수와 함께 수신
- [ ] 관리자 페이지에서 이벤트 미발송
- [ ] 이벤트 매개변수에 PII 없음
- [ ] typecheck / lint / build 통과, 기존 화면 동작·성능 회귀 없음 (analytics 코드는 전부 비차단)
- [ ] GA4 DebugView에서 실 수신 확인

## 5. 주의사항 (구현자 필독)
- 이 저장소는 `exactOptionalPropertyTypes: true` — 옵셔널 매개변수는 조건부 스프레드로.
- react-compiler 린트가 `useEffect` 내 setState를 제한 — AnalyticsPageView는 setState 없이 ref/직접 push로만 구현할 것.
- GET 폼 제출 추적은 클릭 시점 push가 페이지 이탈로 유실될 수 있음 → 도착 페이지에서 쿼리 파라미터 기반으로 쏘는 패턴 사용(§3 Phase 2-4).
- WatchButton은 홈/탐색/상세/관심목록에서 공용 — 이벤트에 `page_type`을 실어 발생 위치를 구분할 것(`usePathname` 활용).
- `dataLayer.push`는 GTM 미로딩 시에도 안전(배열에 큐잉됨) — 로딩 순서 걱정 불필요.
