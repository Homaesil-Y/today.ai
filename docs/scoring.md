# Trend Score v1

배점은 교차 채널 25, 반응 속도 20, GitHub·제품 성장 15, Threads 12, Reddit 10, 신규성 8, Instagram 5, 품질 5로 총 100점이다. `packages/scoring`은 이미 정규화된 component를 범위 내로 clamp한 뒤 결정적으로 합산한다.

현재 구현 완료: component 상한, v1 상수, 상태 기본 규칙, 동일 입력 테스트. 미완료: 플랫폼별 백분위/로그 정규화, 시간창별 velocity, Trust Score 조작 감점, 장애 채널 재가중. Instagram은 신호가 있을 때만 가산하며 부재·장애는 감점하지 않는다.
