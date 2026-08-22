import { describe, expect, it } from "vitest";
import { isEditorialHost } from "./candidate";

/**
 * 글·스레드를 호스팅하는 도메인 판정.
 *
 * 실측 2026-08-22: 공개 엔티티 766건 중 4건이 제품이 아니라 글이었다 — towardsdev.com 기사,
 * reddit.com 스레드, twitter.com 트윗 2건. 이런 링크는 제품명을 정할 근거가 없어 이름이
 * 게시글 문장 그대로 남는다.
 */
describe("isEditorialHost", () => {
  it("rejects the hosts that actually leaked entities into production", () => {
    expect(isEditorialHost("towardsdev.com")).toBe(true);
    expect(isEditorialHost("reddit.com")).toBe(true);
    expect(isEditorialHost("twitter.com")).toBe(true);
    expect(isEditorialHost("x.com")).toBe(true);
  });

  it("rejects subdomains, not just exact hosts", () => {
    // 예전엔 정확히 일치하는 호스트만 걸러서 이 형태가 모두 통과했다.
    expect(isEditorialHost("someone.medium.com")).toBe(true);
    expect(isEditorialHost("newsletter.substack.com")).toBe(true);
    expect(isEditorialHost("blog.blogspot.com")).toBe(true);
  });

  it("ignores a www prefix and letter case", () => {
    expect(isEditorialHost("WWW.Medium.com")).toBe(true);
  });

  it("keeps hosts where products genuinely ship", () => {
    // 제품이 실제로 배포되는 곳은 막으면 안 된다.
    expect(isEditorialHost("overlk.itch.io")).toBe(false);
    expect(isEditorialHost("krishna-modi12.github.io")).toBe(false);
    expect(isEditorialHost("apps.apple.com")).toBe(false);
    expect(isEditorialHost("producthunt.com")).toBe(false);
    expect(isEditorialHost("github.com")).toBe(false);
  });

  it("does not match a host that merely ends with the same letters", () => {
    // "notmedium.com" 은 medium.com 의 서브도메인이 아니다.
    expect(isEditorialHost("notmedium.com")).toBe(false);
    expect(isEditorialHost("mydev.to.example.com")).toBe(false);
  });
});
