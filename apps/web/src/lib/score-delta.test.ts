import { describe, expect, it } from "vitest";
import { formatScoreDelta } from "./score-delta";

describe("formatScoreDelta", () => {
  it("separates having no prior snapshot from having no change", () => {
    // 예전엔 둘 다 "초기 집계"로 나와, 변동이 없는 서비스가 신규처럼 보였다.
    expect(formatScoreDelta(null).label).toBe("초기 집계");
    expect(formatScoreDelta(0).label).toBe("변화 없음");
  });

  it("marks a drop as negative instead of printing a plus sign", () => {
    // 예전엔 `+${delta}` 로 찍어 하락이 "+-3.2" 로 나왔다.
    expect(formatScoreDelta(-3.2)).toEqual({ label: "-3.2", tone: "negative" });
  });

  it("marks a rise as positive", () => {
    expect(formatScoreDelta(2.4)).toEqual({ label: "+2.4", tone: "positive" });
  });

  it("rounds to one decimal place", () => {
    expect(formatScoreDelta(1.24).label).toBe("+1.2");
    expect(formatScoreDelta(-1.26).label).toBe("-1.3");
  });

  it("treats undefined and non-finite input as no prior snapshot", () => {
    expect(formatScoreDelta(undefined).label).toBe("초기 집계");
    expect(formatScoreDelta(Number.NaN).label).toBe("초기 집계");
  });
});
