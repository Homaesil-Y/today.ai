"use server";

import { signConsentToken } from "@/lib/consent-token";

// 가입 화면에서 동의를 체크하고 구글로 떠나기 직전에 호출된다. 토큰은 서버 시크릿으로 서명되므로
// 클라이언트가 스스로 만들어낼 수 없고, /auth/callback이 서버에서 다시 검증한다.
export async function issueConsentToken(): Promise<string> {
  return signConsentToken();
}
