import { describe, expect, it } from "vitest";

/**
 * 수집 CLI 의 종료 코드 규칙.
 *
 * 2026-09-12·13 실행 2건이 "GitHub 저장만 504 로 실패, Hacker News·Product Hunt 는 수집·저장까지
 * 정상 완료" 인 상태에서 exitCode 1 로 끝났다. 그 결과 뒤따르는 점수 계산·표시명 정정·리포트·검증이
 * 전부 건너뛰어졌다 — 데이터는 들어왔는데 그 데이터를 쓰는 단계가 사라진 셈이다.
 *
 * 채널은 서로 독립적이고 각각 3시간 뒤 다음 주기에 다시 시도되므로, 하나라도 성공하면 파이프라인을
 * 계속 진행하는 게 맞다. 전 채널 실패(= 공통 원인)일 때만 실행을 실패로 표시한다.
 *
 * cli/collect.ts 의 규칙을 그대로 옮긴 것이다 — 그 파일은 최상위 await 을 쓰는 실행 스크립트라
 * 직접 import 할 수 없어 규칙만 고정한다.
 */
function shouldFailRun(summaries: Array<{ error?: string }>): boolean {
  const succeeded = summaries.filter((s) => s.error === undefined).length;
  const failed = summaries.length - succeeded;
  return failed > 0 && succeeded === 0;
}

describe("수집 종료 코드", () => {
  it("한 채널만 실패하면 실행은 성공으로 끝난다", () => {
    // 실제 2026-09-13 06:46Z 실행의 결과 모양.
    expect(shouldFailRun([
      { error: "Gateway Timeout" },  // github
      {},                            // hacker_news
      {},                            // product_hunt
      {},                            // reddit(partial 도 error 아님)
    ])).toBe(false);
  });

  it("전 채널이 실패하면 실패로 표시한다", () => {
    expect(shouldFailRun([
      { error: "Gateway Timeout" },
      { error: "Gateway Timeout" },
      { error: "Gateway Timeout" },
      { error: "Gateway Timeout" },
    ])).toBe(true);
  });

  it("전부 성공하면 당연히 성공이다", () => {
    expect(shouldFailRun([{}, {}, {}, {}])).toBe(false);
  });

  it("채널이 하나도 없으면 실패가 아니다", () => {
    expect(shouldFailRun([])).toBe(false);
  });
});
