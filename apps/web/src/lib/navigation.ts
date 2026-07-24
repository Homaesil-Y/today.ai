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

/**
 * 안전한 상대 경로(safeNextPath로 검증된 값)에 쿼리 파라미터 1개를 덧붙인다.
 * 이미 쿼리·해시가 있어도 안전하게 이어붙이며, key/value는 항상 고정 문자열만 전달한다
 * (사용자 입력을 직접 이어붙이지 않으므로 인젝션 위험이 없다).
 */
export function withParam(path: string, key: string, value: string): string {
  const hashIndex = path.indexOf("#");
  const base = hashIndex === -1 ? path : path.slice(0, hashIndex);
  const hash = hashIndex === -1 ? "" : path.slice(hashIndex);
  const separator = base.includes("?") ? "&" : "?";
  return `${base}${separator}${key}=${value}${hash}`;
}
