import { describe, expect, it } from "vitest";
import { pageTypeFor } from "./analytics";

describe("pageTypeFor", () => {
  it("maps known routes to their page_type", () => {
    expect(pageTypeFor("/")).toBe("home");
    expect(pageTypeFor("/explore")).toBe("explore");
    expect(pageTypeFor("/categories")).toBe("categories");
    expect(pageTypeFor("/compare")).toBe("compare");
    expect(pageTypeFor("/watchlist")).toBe("watchlist");
    expect(pageTypeFor("/news")).toBe("news");
    expect(pageTypeFor("/reports")).toBe("reports");
    expect(pageTypeFor("/settings")).toBe("settings");
    expect(pageTypeFor("/login")).toBe("login");
    expect(pageTypeFor("/onboarding")).toBe("onboarding");
  });

  it("maps dynamic detail routes before their prefix collides with a list route", () => {
    expect(pageTypeFor("/services/klaatcode")).toBe("service_detail");
    expect(pageTypeFor("/reports/2026-07-24")).toBe("report_detail");
    // "/reports/2026-07-24" must not fall through to the generic "/reports" branch.
    expect(pageTypeFor("/reports/2026-07-24")).not.toBe("reports");
  });

  it("marks every admin route so events can be suppressed", () => {
    expect(pageTypeFor("/admin")).toBe("admin");
    expect(pageTypeFor("/admin/review")).toBe("admin");
    expect(pageTypeFor("/admin/categories")).toBe("admin");
  });

  it("falls back to other for unknown routes", () => {
    expect(pageTypeFor("/methodology")).toBe("other");
    expect(pageTypeFor("/privacy")).toBe("other");
  });
});
