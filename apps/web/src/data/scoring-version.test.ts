import { describe, expect, it } from "vitest";
import { keepLatestScoringVersion } from "./scoring-version";

/**
 * 점수 공식이 바뀌면 scoring_version 이 올라가고 같은 엔티티에 두 척도의 행이 함께 남는다.
 * 걸러내지 않으면 "직전 점수"로 옛 척도 값이 잡혀 24H 변화·스파크라인·순위 변동이 전부
 * 척도 차이를 변화로 착각한다.
 *
 * 실제로 겪은 값(2026-08-26, entity 012e5061): v2 11.4 를 v1 6.9 와 비교해 +4.5 상승으로
 * 보여줬지만, 같은 척도끼리 비교하면 14.6 → 11.4 로 -3.2 하락이었다.
 */
const row = (entity_id: string, scoring_version: string, total_score: number) => ({ entity_id, scoring_version, total_score });

describe("keepLatestScoringVersion", () => {
  it("최신 척도가 아닌 행을 버린다", () => {
    // calculated_at 내림차순으로 들어온다고 가정한다(첫 행이 최신).
    const rows = [
      row("e1", "v2-bootstrap", 11.4),
      row("e1", "v1-bootstrap", 6.9),
      row("e1", "v2-bootstrap", 14.6),
      row("e1", "v1-bootstrap", 25.9),
    ];
    expect(keepLatestScoringVersion(rows).map((r) => r.total_score)).toEqual([11.4, 14.6]);
  });

  it("직전 점수가 같은 척도에서 나온다(가짜 상승을 막는다)", () => {
    const rows = [
      row("e1", "v2-bootstrap", 11.4),
      row("e1", "v1-bootstrap", 6.9),
      row("e1", "v2-bootstrap", 14.6),
    ];
    const kept = keepLatestScoringVersion(rows);
    const delta = (kept[0]?.total_score ?? 0) - (kept[1]?.total_score ?? 0);
    expect(delta).toBeCloseTo(-3.2, 1);
  });

  it("엔티티마다 전환 시점이 달라도 각자 기준으로 판단한다", () => {
    const rows = [
      row("e1", "v2-bootstrap", 20),
      row("e1", "v1-bootstrap", 10),
      row("e2", "v1-bootstrap", 30),
      row("e2", "v1-bootstrap", 28),
    ];
    const kept = keepLatestScoringVersion(rows);
    expect(kept.filter((r) => r.entity_id === "e1")).toHaveLength(1);
    expect(kept.filter((r) => r.entity_id === "e2")).toHaveLength(2);
  });

  it("척도가 하나뿐이면 아무것도 버리지 않는다", () => {
    const rows = [row("e1", "v2-bootstrap", 20), row("e1", "v2-bootstrap", 18)];
    expect(keepLatestScoringVersion(rows)).toHaveLength(2);
  });

  it("빈 입력을 견딘다", () => {
    expect(keepLatestScoringVersion([])).toEqual([]);
  });
});
