import { describe, expect, it } from "vitest";
import { safeNextPath } from "./navigation";

describe("safeNextPath", () => {
  it("keeps valid internal paths", () => {
    expect(safeNextPath("/watchlist")).toBe("/watchlist");
    expect(safeNextPath("/admin/review")).toBe("/admin/review");
    expect(safeNextPath("/reports/2026-07-22")).toBe("/reports/2026-07-22");
    expect(safeNextPath("/onboarding?next=/settings")).toBe("/onboarding?next=/settings");
  });

  it("blocks protocol-relative and absolute URLs (open redirect)", () => {
    expect(safeNextPath("//evil.com")).toBe("/");
    expect(safeNextPath("/\\evil.com")).toBe("/");
    expect(safeNextPath("https://evil.com")).toBe("/");
    expect(safeNextPath("http://evil.com")).toBe("/");
    expect(safeNextPath("/path\\to")).toBe("/");
  });

  it("blocks non-path and control-character inputs", () => {
    expect(safeNextPath("evil.com")).toBe("/");
    expect(safeNextPath("")).toBe("/");
    expect(safeNextPath(undefined)).toBe("/");
    expect(safeNextPath(null)).toBe("/");
    expect(safeNextPath(123)).toBe("/");
    expect(safeNextPath("/foo\nbar")).toBe("/");
  });

  it("uses the provided fallback", () => {
    expect(safeNextPath("//evil.com", "/home")).toBe("/home");
  });
});
