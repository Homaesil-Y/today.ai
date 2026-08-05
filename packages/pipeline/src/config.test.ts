import { describe, expect, it } from "vitest";
import { analysisBudgetMinutesFromEnv, analysisLimitFromEnv, autoApproveAnalyzedFromEnv, DEFAULT_ANALYSIS_BUDGET_MINUTES } from "./config";

describe("autoApproveAnalyzedFromEnv", () => {
  it("설정이 없으면 자동 승인을 켠다", () => {
    expect(autoApproveAnalyzedFromEnv(undefined)).toBe(true);
    expect(autoApproveAnalyzedFromEnv("")).toBe(true);
  });

  it("명시적인 끄기 값만 자동 승인을 끈다", () => {
    for (const value of ["false", "FALSE", "0", "off", "no"]) {
      expect(autoApproveAnalyzedFromEnv(value)).toBe(false);
    }
    expect(autoApproveAnalyzedFromEnv("true")).toBe(true);
  });
});

describe("analysisLimitFromEnv", () => {
  it("설정이 없거나 잘못되면 무료 할당량 적응형 기본값 50을 사용한다", () => {
    expect(analysisLimitFromEnv(undefined)).toBe(50);
    expect(analysisLimitFromEnv("invalid")).toBe(50);
  });

  it("분석 개수를 0~100 범위의 정수로 제한한다", () => {
    expect(analysisLimitFromEnv("20.9")).toBe(20);
    expect(analysisLimitFromEnv("-1")).toBe(0);
    expect(analysisLimitFromEnv("500")).toBe(100);
  });
});

describe("analysisBudgetMinutesFromEnv", () => {
  it("설정이 없거나 잘못되면 잡 타임아웃보다 짧은 기본값을 쓴다", () => {
    expect(analysisBudgetMinutesFromEnv(undefined)).toBe(DEFAULT_ANALYSIS_BUDGET_MINUTES);
    expect(analysisBudgetMinutesFromEnv("")).toBe(DEFAULT_ANALYSIS_BUDGET_MINUTES);
    expect(analysisBudgetMinutesFromEnv("invalid")).toBe(DEFAULT_ANALYSIS_BUDGET_MINUTES);
  });

  it("0 이하는 기본값으로 되돌린다", () => {
    // 0이면 분석을 아예 못 하므로 사고로 대기열이 멈추는 걸 막는다.
    expect(analysisBudgetMinutesFromEnv("0")).toBe(DEFAULT_ANALYSIS_BUDGET_MINUTES);
    expect(analysisBudgetMinutesFromEnv("-5")).toBe(DEFAULT_ANALYSIS_BUDGET_MINUTES);
  });

  it("상한을 넘지 않게 자른다", () => {
    expect(analysisBudgetMinutesFromEnv("12.5")).toBe(12.5);
    expect(analysisBudgetMinutesFromEnv("600")).toBe(60);
  });
});
