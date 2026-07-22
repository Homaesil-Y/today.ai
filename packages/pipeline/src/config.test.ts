import { describe, expect, it } from "vitest";
import { analysisLimitFromEnv, autoApproveAnalyzedFromEnv } from "./config";

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
