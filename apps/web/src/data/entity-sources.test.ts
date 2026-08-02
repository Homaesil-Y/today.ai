import { describe, expect, it } from "vitest";
import { resolveSources, sourceSignalLabel } from "./entity-sources";

describe("resolveSources", () => {
  // 이 테스트가 없어서 채널을 추가할 때 표시 계층이 방치됐다.
  // Product Hunt·Reddit 수집기를 붙인 커밋(1454278, 09b2522)은 apps/web을 건드리지 않았고,
  // 화면은 계속 "github_url이 있으면 GitHub, 없으면 Hacker News"로 추측했다.
  it("reports the channels the pipeline actually recorded", () => {
    expect(resolveSources(["product_hunt"], null)).toEqual(["product_hunt"]);
    expect(resolveSources(["reddit"], null)).toEqual(["reddit"]);
    expect(resolveSources(["hacker_news"], null)).toEqual(["hacker_news"]);
    expect(resolveSources(["github"], "https://github.com/acme/tool")).toEqual(["github"]);
  });

  it("does not claim GitHub just because the product has a repository", () => {
    // github_url은 "GitHub 수집기가 찾았다"가 아니라 "저장소가 있다"는 뜻이다.
    // HN에서 발견된 저장소도 github_url이 채워지므로 채널 판별 근거가 될 수 없다.
    expect(resolveSources(["hacker_news"], "https://github.com/acme/tool")).toEqual(["hacker_news"]);
  });

  it("keeps every channel when a product was seen on more than one", () => {
    expect(resolveSources(["product_hunt", "github"], null)).toEqual(["github", "product_hunt"]);
    expect(resolveSources(["reddit", "hacker_news", "github"], null)).toEqual(["github", "hacker_news", "reddit"]);
  });

  it("dedupes and drops codes the UI cannot render", () => {
    expect(resolveSources(["github", "github"], null)).toEqual(["github"]);
    expect(resolveSources(["github", "some_future_channel"], null)).toEqual(["github"]);
  });

  it("falls back to the old guess only when nothing was recorded", () => {
    // 백필 이전 행 호환. 여기 걸리는 데이터가 남아 있으면 마이그레이션이 안 돌았다는 신호다.
    expect(resolveSources([], "https://github.com/acme/tool")).toEqual(["github"]);
    expect(resolveSources([], null)).toEqual(["hacker_news"]);
    expect(resolveSources(["some_future_channel"], null)).toEqual(["hacker_news"]);
  });
});

describe("sourceSignalLabel", () => {
  it("labels every channel the pipeline can ingest", () => {
    expect(sourceSignalLabel("github")).toBe("GitHub 감지 점수");
    expect(sourceSignalLabel("hacker_news")).toBe("Hacker News 감지 점수");
    expect(sourceSignalLabel("product_hunt")).toBe("Product Hunt 감지 점수");
    expect(sourceSignalLabel("reddit")).toBe("Reddit 감지 점수");
  });
});
