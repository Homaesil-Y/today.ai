import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// 별도 시크릿을 늘리지 않기 위해 SUPABASE_SECRET_KEY를 HMAC 서명 키로 재사용한다.
function secret(): string {
  const value = process.env.SUPABASE_SECRET_KEY;
  if (!value) throw new Error("SUPABASE_SECRET_KEY is required to sign unsubscribe tokens");
  return value;
}

export function signUnsubscribeToken(userId: string): string {
  return createHmac("sha256", secret()).update(userId).digest("base64url");
}

export function verifyUnsubscribeToken(userId: string, token: string): boolean {
  const expected = Buffer.from(signUnsubscribeToken(userId));
  const actual = Buffer.from(token);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
