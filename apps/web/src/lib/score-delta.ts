/**
 * 직전 스냅샷 대비 점수 변화를 표시용 문자열로 만든다.
 *
 * 표시 지점이 네 곳(순위표 데스크톱·모바일, 상세 플랫폼 지표, 홈 카드)인데 각자 `+${delta}` 로
 * 찍고 있었다. 그래서 (1) 하락은 "+-3" 으로 나오고 (2) 변화 0과 비교할 이력이 없는 경우가
 * 똑같이 "초기 집계" 로 뭉뚱그려졌다. 판정을 한곳에 모아 네 곳이 같은 규칙을 쓰게 한다.
 */
export interface ScoreDeltaDisplay {
  label: string;
  tone: "positive" | "negative" | "neutral";
}

export function formatScoreDelta(delta: number | null | undefined): ScoreDeltaDisplay {
  // 비교할 직전 스냅샷이 없는 경우(엔티티 수집 첫날)와 변화가 0인 경우는 다른 사실이다.
  if (delta === null || delta === undefined || !Number.isFinite(delta)) {
    return { label: "초기 집계", tone: "neutral" };
  }
  if (delta === 0) return { label: "변화 없음", tone: "neutral" };

  const rounded = Math.round(Math.abs(delta) * 10) / 10;
  return delta > 0
    ? { label: `+${rounded.toLocaleString("ko-KR")}`, tone: "positive" }
    : { label: `-${rounded.toLocaleString("ko-KR")}`, tone: "negative" };
}
