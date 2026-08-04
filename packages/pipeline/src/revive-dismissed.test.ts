import { describe, expect, it } from "vitest";
import { revivedVisibilityPatch } from "./repository";

describe("revivedVisibilityPatch", () => {
  it("brings an auto-dismissed candidate back to review when it is collected again", () => {
    // "오래된 후보 정리"로 내려간 후보. private는 분석 대기열에서 제외되고 관리자 UI의
    // 승인/보류도 review만 대상이라, 이 복구가 없으면 되살릴 방법이 아예 없다.
    expect(revivedVisibilityPatch({ visibility: "private", dismissed_as_stale_at: "2026-08-01T00:00:00Z" }))
      .toEqual({ visibility: "review", dismissed_as_stale_at: null });
  });

  it("leaves a manually held candidate private", () => {
    // 관리자가 직접 "보류"한 것은 표시가 없다. 되살리면 계속 재수집되는 항목을 3시간마다
    // 다시 보류해야 한다(실제로 이 세션에서 비공개 처리한 GitHub 토론 스레드가 그런 경우다).
    expect(revivedVisibilityPatch({ visibility: "private", dismissed_as_stale_at: null })).toEqual({});
  });

  it("never touches a published service", () => {
    expect(revivedVisibilityPatch({ visibility: "public", dismissed_as_stale_at: null })).toEqual({});
    // 표시가 남아 있어도 이미 공개된 서비스를 검토 대기로 되돌리면 사이트에서 사라진다.
    expect(revivedVisibilityPatch({ visibility: "public", dismissed_as_stale_at: "2026-08-01T00:00:00Z" })).toEqual({});
  });

  it("leaves a candidate already waiting for review alone", () => {
    expect(revivedVisibilityPatch({ visibility: "review", dismissed_as_stale_at: null })).toEqual({});
  });
});
