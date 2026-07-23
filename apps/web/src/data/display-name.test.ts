import { describe, expect, it } from "vitest";
import { cleanDisplayName, logoTextFrom } from "./display-name";

describe("cleanDisplayName", () => {
  it("keeps short product names unchanged", () => {
    expect(cleanDisplayName("Klaatcode")).toBe("Klaatcode");
    expect(cleanDisplayName("HolaOS")).toBe("HolaOS");
  });

  it("strips community prefixes", () => {
    expect(cleanDisplayName("Show HN: Foobar")).toBe("Foobar");
    expect(cleanDisplayName("Ask HN: something")).toBe("something");
  });

  it("takes the head before a dash/colon separator", () => {
    expect(cleanDisplayName("Yorishiro — a local agent")).toBe("Yorishiro");
    expect(cleanDisplayName("Superserve: fast serving")).toBe("Superserve");
  });

  it("truncates long sentence-like titles at a word boundary", () => {
    const result = cleanDisplayName("I ran 12 AI bots predicting stocks for two months, every call public");
    expect(result.length).toBeLessThanOrEqual(49);
    expect(result.endsWith("…")).toBe(true);
    expect(result).not.toContain("  ");
  });

  it("never returns empty for non-empty input", () => {
    expect(cleanDisplayName("   Foo   ")).toBe("Foo");
    expect(cleanDisplayName(":::")).toBe(":::");
  });
});

describe("logoTextFrom", () => {
  it("uses the first two alphanumerics uppercased", () => {
    expect(logoTextFrom("Klaatcode")).toBe("KL");
    expect(logoTextFrom("A self-running SIM")).toBe("AS");
  });
});
