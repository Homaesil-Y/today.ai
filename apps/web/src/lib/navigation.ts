/**
 * 로그인/온보딩/콜백의 `next` 파라미터를 안전한 내부 경로로만 제한한다.
 * 오픈 리다이렉트(프로토콜 상대 URL `//evil`, 백슬래시 `/\evil`, 전체 URL, 제어문자)를 차단한다.
 */
export function safeNextPath(input: unknown, fallback = "/"): string {
  if (typeof input !== "string" || input.length === 0) return fallback;
  // 반드시 우리 사이트의 절대 경로여야 한다.
  if (!input.startsWith("/")) return fallback;
  // 프로토콜 상대(`//`, `/\`)는 외부 도메인으로 나갈 수 있어 차단.
  if (input.startsWith("//") || input.startsWith("/\\")) return fallback;
  // 백슬래시는 브라우저가 `/`로 정규화해 우회할 수 있어 차단.
  if (input.includes("\\")) return fallback;
  // 제어문자(0x00-0x1F) 차단.
  for (let i = 0; i < input.length; i += 1) {
    if (input.charCodeAt(i) < 0x20) return fallback;
  }
  return input;
}
