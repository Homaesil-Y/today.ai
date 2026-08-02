import { describe, expect, it } from "vitest";
import { INGESTED_SOURCES, mergeSourceCodes } from "./repository";

describe("mergeSourceCodes", () => {
  it("accumulates channels as the same product arrives from more sources", () => {
    expect(mergeSourceCodes([], "hacker_news")).toEqual(["hacker_news"]);
    expect(mergeSourceCodes(["hacker_news"], "product_hunt")).toEqual(["hacker_news", "product_hunt"]);
    expect(mergeSourceCodes(["product_hunt"], "github")).toEqual(["github", "product_hunt"]);
  });

  it("stays stable so repeated runs do not rewrite the row", () => {
    expect(mergeSourceCodes(["github", "hacker_news"], "github")).toEqual(["github", "hacker_news"]);
    // 입력 순서가 달라도 결과가 같아야 한다(정렬 고정).
    expect(mergeSourceCodes(["product_hunt", "github"], "reddit"))
      .toEqual(mergeSourceCodes(["reddit", "product_hunt"], "github"));
  });

  it("covers every channel the pipeline ingests", () => {
    // 새 수집기를 INGESTED_SOURCES에 추가하면 여기서 자동으로 확인된다.
    for (const source of INGESTED_SOURCES) {
      expect(mergeSourceCodes([], source)).toEqual([source]);
    }
  });
});
