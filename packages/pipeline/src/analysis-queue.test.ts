import { describe, expect, it } from "vitest";
import { type AnalysisPriority, selectPendingAnalyses } from "./analysis-queue";
import { toEvidenceExcerpt } from "./runner";

describe("selectPendingAnalyses", () => {
  it("이미 최근 분석된 상위 후보를 건너뛰고 다음 미분석 후보를 채운다", () => {
    const recent = new Set(["first", "second", "third"]);
    const result = selectPendingAnalyses(
      ["first", "second", "third", "fourth", "fifth", "sixth", "seventh"],
      3,
      (candidate) => (recent.has(candidate) ? "recent" : "unanalyzed"),
    );

    expect(result.pending).toEqual(["fourth", "fifth", "sixth"]);
    expect(result.skipped).toBe(3);
    expect(result.unanalyzed).toBe(4);
    expect(result.remaining).toBe(1);
  });

  it("점수가 낮아도 미분석 후보를 오래된 재분석 후보보다 먼저 처리한다", () => {
    // 입력은 점수 내림차순. staleHigh 가 앞이지만 미분석 후보가 우선해야 한다.
    const priority = new Map<string, AnalysisPriority>([
      ["staleHighScore", "stale"],
      ["unanalyzedMidScore", "unanalyzed"],
      ["staleLowScore", "stale"],
      ["unanalyzedLowScore", "unanalyzed"],
    ]);
    const result = selectPendingAnalyses(
      ["staleHighScore", "unanalyzedMidScore", "staleLowScore", "unanalyzedLowScore"],
      3,
      (candidate) => priority.get(candidate) ?? "recent",
    );

    // 미분석 두 건이 먼저, 그다음 점수 높은 stale 한 건.
    expect(result.pending).toEqual(["unanalyzedMidScore", "unanalyzedLowScore", "staleHighScore"]);
    expect(result.unanalyzed).toBe(2);
    expect(result.stale).toBe(2);
    expect(result.remaining).toBe(1);
  });

  it("보류(excluded) 후보는 분석 대상에서 제외하고 skipped 로 센다", () => {
    const priority = new Map<string, AnalysisPriority>([
      ["held", "excluded"],
      ["fresh", "unanalyzed"],
    ]);
    const result = selectPendingAnalyses(
      ["held", "fresh"],
      5,
      (candidate) => priority.get(candidate) ?? "recent",
    );

    expect(result.pending).toEqual(["fresh"]);
    expect(result.skipped).toBe(1);
  });

  it("한도가 0이면 분석 후보를 선택하지 않는다", () => {
    const result = selectPendingAnalyses(["first"], 0, () => "unanalyzed");
    expect(result).toEqual({ pending: [], skipped: 0, unanalyzed: 1, stale: 0, remaining: 1 });
  });

  it("재분석 후보는 점수순이 아니라 가장 오래된 것부터 고른다", () => {
    // 입력은 점수 내림차순: 점수 높은 쪽이 최근에 분석됐고, 점수 낮은 쪽이 오래 방치된 상황.
    // 점수순 그대로 두면 낮은 점수 쪽은 영영 차례가 오지 않는다(실측: 공개의 25%가 5일+ 방치).
    const analyzedAt = new Map<string, number>([
      ["highScoreFresh", 300],
      ["midScoreOlder", 200],
      ["lowScoreOldest", 100],
    ]);
    const result = selectPendingAnalyses(
      ["highScoreFresh", "midScoreOlder", "lowScoreOldest"],
      2,
      () => "stale",
      (candidate) => analyzedAt.get(candidate) ?? 0,
    );

    expect(result.pending).toEqual(["lowScoreOldest", "midScoreOlder"]);
    expect(result.remaining).toBe(1);
  });

  it("오래된 순 정렬은 재분석 그룹에만 적용되고 미분석 그룹은 점수순을 유지한다", () => {
    const priority = new Map<string, AnalysisPriority>([
      ["staleFresh", "stale"],
      ["unanalyzedHigh", "unanalyzed"],
      ["staleOldest", "stale"],
      ["unanalyzedLow", "unanalyzed"],
    ]);
    const analyzedAt = new Map<string, number>([
      ["staleFresh", 900],
      ["staleOldest", 100],
    ]);
    const result = selectPendingAnalyses(
      ["staleFresh", "unanalyzedHigh", "staleOldest", "unanalyzedLow"],
      4,
      (candidate) => priority.get(candidate) ?? "recent",
      (candidate) => analyzedAt.get(candidate) ?? 0,
    );

    // 미분석 두 건이 입력(점수) 순서 그대로 앞에, 재분석은 오래된 것부터.
    expect(result.pending).toEqual(["unanalyzedHigh", "unanalyzedLow", "staleOldest", "staleFresh"]);
  });
});

describe("toEvidenceExcerpt", () => {
  it("긴 원문을 Gemini 증거 스키마 한도에 맞춘다", () => {
    expect(toEvidenceExcerpt("가".repeat(2_100), "대체 문구")).toHaveLength(2_000);
  });

  it("본문이 비어 있으면 대체 문구를 사용한다", () => {
    expect(toEvidenceExcerpt("   ", "대체 문구")).toBe("대체 문구");
  });
});
