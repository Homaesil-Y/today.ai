# 아키텍처 요약

```text
apps/web (public/admin UI + short request handlers)
        ↓ typed query/API contract
Supabase PostgreSQL/Auth/Storage
        ↑ normalized entities, snapshots, scores
apps/worker (planned scheduler/job runner)
        ↓
packages/collectors → SupabaseCollectorStore → raw_items/collector_runs
        ↓
packages/pipeline → candidate filter/dedupe → entities/mentions/snapshots/scores
        ↓
packages/scoring → deterministic score/status
        ↓
packages/llm → Gemini structured Korean analysis → ai_analyses
```

- 화면은 collector raw payload를 직접 소비하지 않는다.
- platform adapter는 공통 `Collector<TConfig, TPayload>`를 구현하고 Zod 통과 데이터만 `RawItem`으로 변환한다.
- 점수와 상태는 버전이 있는 코드로 계산하고 LLM에 위임하지 않는다.
- worker는 웹 요청 수명과 독립적으로 실행한다. 수집 원문은 `(source_id, source_item_id)` 충돌 기준 upsert로 멱등 저장하고 실행별 `collector_runs`를 남긴다.
- public/auth/admin 경계는 UI 표시가 아니라 Supabase RLS와 server authorization에서 강제한다.
- 신규 후보는 즉시 공개하지 않고 `review` 가시성으로 저장한다. 규칙 필터와 공식 URL/repository/domain 중복 검사를 통과한 후보만 분석한다.
