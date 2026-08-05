import { describe, expect, it } from "vitest";
import { pageTypeFor, trackedPagePath } from "./analytics";

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

describe("trackedPagePath", () => {
  const path = (pathname: string, query: string) =>
    trackedPagePath(pathname, new URLSearchParams(query));

  it("drops the user id and token from the unsubscribe link", () => {
    // 구독 해지 메일 링크: /unsubscribe?u=<사용자 id>&t=<만료 없는 HMAC>
    const result = path("/unsubscribe", "u=8f14e45f-ea0a-4a3e-9c1b-2b7d9c0e1a55&t=Zm9vYmFyYmF6");
    expect(result).toBe("/unsubscribe");
    expect(result).not.toContain("8f14e45f");
    expect(result).not.toContain("Zm9vYmFyYmF6");
  });

  it("keeps the search and filter params analytics actually uses", () => {
    expect(path("/explore", "q=agent&period=7d&category=coding&source=github&minTrust=70&sort=score&page=2"))
      .toBe("/explore?q=agent&period=7d&category=coding&source=github&minTrust=70&sort=score&page=2");
  });

  it("returns the bare pathname when nothing is allowed through", () => {
    expect(path("/settings", "saved=1&daily_digest=1&surge_alert=0")).toBe("/settings");
    expect(path("/", "")).toBe("/");
  });

  it("drops unknown params instead of passing them through", () => {
    // 허용 목록 방식이라, 나중에 추가되는 파라미터는 기본적으로 전송되지 않는다.
    expect(path("/news", "q=openai&access_token=secret123&email=a@b.com")).toBe("/news?q=openai");
  });

  it("keeps allowed keys in a stable order regardless of URL order", () => {
    expect(path("/explore", "sort=score&q=agent")).toBe(path("/explore", "q=agent&sort=score"));
  });
});
