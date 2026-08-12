import { describe, expect, it } from "vitest";
import { sanitizeCategories } from "./sanitize-categories";

/** 2026-08-13 프로덕션의 활성 카테고리 23개. */
const ENABLED = [
  "ai-agents", "coding", "image", "video", "audio-music", "document-rag", "productivity",
  "data", "design", "marketing", "education", "open-models", "automation", "no-code",
  "infrastructure-api", "other", "ai-security-governance", "ai-simulation-game",
  "ai-research", "local-ai-tools", "robotics-hardware-ai", "industry-ai", "agent-framework",
];

describe("sanitizeCategories", () => {
  it("accepts every category when the user picks all of them", () => {
    // 예전 스키마는 최대 20개라, 카테고리가 23개로 늘어난 뒤 "전체 선택"이 항상 저장 실패했다.
    expect(sanitizeCategories([...ENABLED], ENABLED)).toHaveLength(23);
  });

  it("has no upper bound tied to today's category count", () => {
    // 카테고리가 더 늘어도 같은 방식으로 통과해야 한다.
    const grown = [...ENABLED, "quantum-ai", "edge-ai", "ai-ops"];
    expect(sanitizeCategories(grown, grown)).toHaveLength(26);
  });

  it("drops slugs that are not enabled categories", () => {
    expect(sanitizeCategories(["ai-agents", "not-a-real-category", "automation"], ENABLED))
      .toEqual(["ai-agents", "automation"]);
  });

  it("removes duplicates", () => {
    expect(sanitizeCategories(["ai-agents", "ai-agents", "coding"], ENABLED))
      .toEqual(["ai-agents", "coding"]);
  });

  it("returns nothing when the user selects nothing", () => {
    expect(sanitizeCategories([], ENABLED)).toEqual([]);
    expect(sanitizeCategories([], null)).toEqual([]);
  });

  it("keeps the selection when the category list could not be read", () => {
    // 목록 조회 실패로 선택을 버리면 저장이 조용히 비어버린다.
    expect(sanitizeCategories(["ai-agents", "automation", "ai-agents"], null))
      .toEqual(["ai-agents", "automation"]);
  });
});
