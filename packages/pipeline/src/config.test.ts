import { describe, expect, it } from "vitest";
import { autoApproveAnalyzedFromEnv } from "./config";

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
