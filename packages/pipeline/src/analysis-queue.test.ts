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
});

describe("toEvidenceExcerpt", () => {
  it("긴 원문을 Gemini 증거 스키마 한도에 맞춘다", () => {
    expect(toEvidenceExcerpt("가".repeat(2_100), "대체 문구")).toHaveLength(2_000);
  });

  it("본문이 비어 있으면 대체 문구를 사용한다", () => {
    expect(toEvidenceExcerpt("   ", "대체 문구")).toBe("대체 문구");
  });
});
