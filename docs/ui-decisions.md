# UI 구현 결정

| 결정 | 근거 | 영향 |
|---|---|---|
| Light만 노출 | UI 3.2는 미완성 Dark 비노출을 요구 | `color-scheme: light`, 설정 placeholder에도 Dark 없음 |
| Tailwind 대신 semantic CSS variables 우선 | 빈 저장소에서 토큰과 시각 규칙을 가장 직접적으로 검증 | 추후 Tailwind theme으로 동일 토큰을 매핑 가능 |
| TOP 10은 desktop table/mobile list 두 구조 | 단순 열 숨김만으로는 모바일 핵심 정보 가독성이 낮음 | 768px 아래에서 card list 전환 |
| TOP1만 제한적 gradient line | 명세에서 허용한 위치 | 카드 전체 gradient와 glass 효과 배제 |
| 실제 chart library 대신 접근 가능한 SVG fixture | 초기 목표는 기본 상세 레이아웃과 mock 연결 | 다중 시계열·event marker는 Phase 4 후속 |
| 미완성 메뉴는 준비 상태 페이지로 연결 | 완성되지 않은 기능을 작동하는 것처럼 보이지 않게 함 | 사용자는 현재 가능한 메인·상세로 복귀 가능 |
| Instagram 지연 배너를 dashboard에 표시 | partial/stale 상태를 최초 화면부터 검증 | 전체 화면을 막지 않고 나머지 데이터 렌더링 |
| 공식 서비스 로고가 없으면 아이콘 영역을 생략 | 문자 약어 placeholder는 정보 가치보다 시각적 복잡도가 큼 | 공식 자산 연결 전까지 서비스명 중심으로 표시 |
| 랭킹 헤더는 페이지 sticky 대신 정적 배치 | 반투명 전역 헤더 아래에서 첫 행이 겹쳐 보이는 문제가 발생 | 행 가독성을 우선하며, 향후 독립 스크롤 데이터 그리드에서 sticky 재도입 |
