import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// 가입 동의를 OAuth 왕복 구간 동안 넘기기 위한 서명 토큰.
// 쿠키·쿼리값처럼 클라이언트가 위조할 수 있는 값 대신 서버 시크릿으로 서명하고 서버에서만 검증한다.
// unsubscribe-token.ts와 동일하게 SUPABASE_SECRET_KEY를 재사용한다(시크릿을 늘리지 않기 위해).
const MAX_AGE_MS = 15 * 60 * 1000;

function secret(): string {
  const value = process.env.SUPABASE_SECRET_KEY;
  if (!value) throw new Error("SUPABASE_SECRET_KEY is required to sign consent tokens");
  return value;
}

function signature(issuedAt: string): string {
  return createHmac("sha256", secret()).update(`consent:${issuedAt}`).digest("base64url");
}

export function signConsentToken(): string {
  const issuedAt = Date.now().toString();
  return `${issuedAt}.${signature(issuedAt)}`;
}

export function verifyConsentToken(token: string | null): boolean {
  if (!token) return false;
  const [issuedAt, provided] = token.split(".");
  if (!issuedAt || !provided) return false;

  const expected = Buffer.from(signature(issuedAt));
  const actual = Buffer.from(provided);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return false;

  // 서명이 유효해도 오래된 토큰은 거부한다(재사용 창을 좁힌다).
  const age = Date.now() - Number(issuedAt);
  return Number.isFinite(age) && age >= 0 && age < MAX_AGE_MS;
}
