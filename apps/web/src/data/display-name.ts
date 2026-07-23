// 공개 화면용 서비스 표시명 정리.
// 수집기가 HN/커뮤니티 제목을 그대로 저장한 탓에 "I ran 12 AI bots predicting stocks…" 같은
// 문장형 이름이 목록 가독성을 해친다. 렌더 시점에 접두사·군더더기를 제거하고 길이를 다듬는다.
// (원본 데이터는 건드리지 않는 순수 함수 — 기존 88건에도 즉시 적용된다.)

const MAX_LENGTH = 48;

export function cleanDisplayName(raw: string): string {
  const original = raw.trim();
  if (!original) return original;

  let name = original;
  // 커뮤니티 접두사 제거: "Show HN:", "Ask HN:", "Tell HN:"
  name = name.replace(/^(show|ask|tell)\s+hn:\s*/iu, "");
  // 첫 구분자(대시/콜론) 앞을 제품명으로 사용: "Foo — bar", "Foo: bar" → "Foo"
  const [head] = name.split(/\s+[–—-]\s+|:\s+/u, 1);
  if (head && head.trim()) name = head.trim();
  // 후행 구두점 정리
  name = name.replace(/[,;:\s]+$/u, "").trim();
  // 문장형으로 여전히 긴 제목은 스캔 가능하도록 단어 경계에서 절단
  if (name.length > MAX_LENGTH) {
    const clipped = name.slice(0, MAX_LENGTH);
    const lastSpace = clipped.lastIndexOf(" ");
    name = `${(lastSpace > 20 ? clipped.slice(0, lastSpace) : clipped).trimEnd()}…`;
  }
  return name || original;
}

// 로고 이니셜은 정리된 이름 기준으로 뽑는다.
export function logoTextFrom(name: string): string {
  return name.replace(/[^\p{L}\p{N}]/gu, "").slice(0, 2).toUpperCase() || name.slice(0, 2).toUpperCase();
}
