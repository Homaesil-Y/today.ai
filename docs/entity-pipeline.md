# 엔티티 처리 파이프라인

`packages/pipeline`은 `raw_items`에 저장된 GitHub·Hacker News 수집 결과를 서비스 후보로 변환한다.

1. AI 관련성과 제품 의도를 규칙으로 필터링한다. Hacker News는 `Show HN` 제품 소개와 직접 GitHub repository 링크를 우선해 일반 기사·블로그 오탐을 줄인다.
2. 교육 자료, 논문 구현, 단순 글과 자체 HN 게시물은 제외한다.
3. canonical URL, GitHub repository URL, 공식 도메인으로 기존 엔티티와 중복을 검사한다.
4. 신규 서비스는 `review` 상태로 생성하고 alias, mention, metric snapshot을 멱등 저장한다.
5. 결정적 초기 점수와 `WATCH` 상태를 저장한다.
6. 점수 상위 후보를 Gemini로 분석하고 Zod 검증 후 `ai_analyses`에 저장한다. 기본 상한은 실행당 3건이다.

실행 명령은 `pnpm process:live`이고, 쓰기 없이 후보를 확인하려면 `pnpm preview:live`, 저장 건수 검증은 `pnpm verify:live`을 사용한다. `202607200004_pipeline_service_role_grants.sql` 마이그레이션은 2026-07-22 적용했다.

## 최초 실행 결과

- raw items: 80
- accepted/rejected candidates: 40/40
- entities, mentions, metric snapshots, trend scores: 각 40
- Gemini analyses: 3
- analysis errors: 0
