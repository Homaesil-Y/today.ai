# 엔티티 처리 파이프라인

`packages/pipeline`은 `raw_items`에 저장된 GitHub·Hacker News·Product Hunt 수집 결과를 서비스 후보로 변환한다. 수용 채널은 `INGESTED_SOURCES`에 정의되어 있고, 새 수집기를 붙일 때 이 목록과 `extractEntityCandidate` 분기를 함께 추가한다.

1. AI 관련성과 제품 의도를 규칙으로 필터링한다. Hacker News는 `Show HN` 제품 소개와 직접 GitHub repository 링크를 우선해 일반 기사·블로그 오탐을 줄인다. Product Hunt는 이미 출시된 제품이므로 제품 의도는 전제하고 AI 관련성(제목·태그라인·설명·토픽)만 검사하며, 공식 website URL을 대표 도메인으로 사용한다. Reddit은 노이즈가 많아 외부 제품 링크(reddit 도메인·기사·자체 토론 글 제외)이면서 AI·제품 의도를 모두 만족하는 게시물만 통과시키고, 제목 접두사("I built", "Show:" 등)를 제거해 제품명을 추출한다.
2. 교육 자료, 논문 구현, 단순 글과 자체 HN 게시물은 제외한다.
3. canonical URL, GitHub repository URL, 공식 도메인으로 기존 엔티티와 중복을 검사한다.
4. 신규 서비스는 `review` 상태로 생성하고 alias, mention, metric snapshot을 멱등 저장한다.
5. 결정적 초기 점수와 `WATCH` 상태를 저장한다.
6. 미분석 후보를 우선해 Gemini로 분석하고 Zod 검증 후 `ai_analyses`에 저장한다. 우선순위와 상한은 [scoring·분석 대기열](implementation-roadmap.md) 참고(실행당 최대 50건, 무료 한도 도달 시 중단·다음 실행 재개).

실행 명령은 `pnpm process:live`이고, 쓰기 없이 후보를 확인하려면 `pnpm preview:live`, 저장 건수 검증은 `pnpm verify:live`을 사용한다. `202607200004_pipeline_service_role_grants.sql` 마이그레이션은 2026-07-22 적용했다.

## 최초 실행 결과

- raw items: 80
- accepted/rejected candidates: 40/40
- entities, mentions, metric snapshots, trend scores: 각 40
- Gemini analyses: 3
- analysis errors: 0
