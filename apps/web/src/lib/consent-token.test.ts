import { beforeAll, describe, expect, it, vi } from "vitest";

// consent-token은 "server-only"를 import하므로 테스트에서는 그 가드를 비활성화한다.
vi.mock("server-only", () => ({}));

let signConsentToken: () => string;
let verifyConsentToken: (token: string | null) => boolean;

beforeAll(async () => {
  process.env.SUPABASE_SECRET_KEY = "test-secret-key-for-consent-token";
  const mod = await import("./consent-token");
  signConsentToken = mod.signConsentToken;
  verifyConsentToken = mod.verifyConsentToken;
});

describe("consent token", () => {
  it("accepts a freshly issued token", () => {
    expect(verifyConsentToken(signConsentToken())).toBe(true);
  });

  it("rejects a missing or malformed token", () => {
    expect(verifyConsentToken(null)).toBe(false);
    expect(verifyConsentToken("")).toBe(false);
    expect(verifyConsentToken("nodot")).toBe(false);
    expect(verifyConsentToken(".")).toBe(false);
  });

  // 핵심: 클라이언트가 값을 지어내서 동의를 위조할 수 없어야 한다.
  it("rejects a forged token that was not signed with the secret", () => {
    expect(verifyConsentToken(`${Date.now()}.forged-signature`)).toBe(false);
  });

  it("rejects a token whose timestamp was tampered with after signing", () => {
    const [issuedAt, sig] = signConsentToken().split(".");
    expect(issuedAt).toBeDefined();
    const shifted = String(Number(issuedAt) - 1);
    expect(verifyConsentToken(`${shifted}.${sig}`)).toBe(false);
  });

  it("rejects an expired token", () => {
    const [, sig] = signConsentToken().split(".");
    // 서명은 유효하지만 발급 시각이 만료 창(15분)을 넘긴 경우를 흉내낼 수 없으므로,
    // 실제 서명 대상인 과거 시각으로 새로 서명해 검증한다.
    const stale = Date.now() - 16 * 60 * 1000;
    vi.setSystemTime(new Date(stale));
    const staleToken = signConsentToken();
    vi.useRealTimers();
    expect(sig).toBeDefined();
    expect(verifyConsentToken(staleToken)).toBe(false);
  });

  it("rejects a token issued in the future", () => {
    vi.setSystemTime(new Date(Date.now() + 60 * 60 * 1000));
    const futureToken = signConsentToken();
    vi.useRealTimers();
    expect(verifyConsentToken(futureToken)).toBe(false);
  });
});
