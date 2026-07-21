import { describe, expect, it } from "vitest";
import { selectPendingAnalyses } from "./analysis-queue";
import { toEvidenceExcerpt } from "./runner";

describe("selectPendingAnalyses", () => {
  it("이미 분석된 상위 후보를 건너뛰고 다음 미분석 후보를 채운다", async () => {
    const completed = new Set(["first", "second", "third"]);
    const result = await selectPendingAnalyses(
      ["first", "second", "third", "fourth", "fifth", "sixth", "seventh"],
      3,
      async (candidate) => completed.has(candidate),
    );

    expect(result.pending).toEqual(["fourth", "fifth", "sixth"]);
    expect(result.skipped).toBe(3);
  });

  it("한도가 0이면 분석 후보를 선택하지 않는다", async () => {
    const result = await selectPendingAnalyses(["first"], 0, async () => false);
    expect(result).toEqual({ pending: [], skipped: 0 });
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
