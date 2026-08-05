import type { SourceCode } from "@ai-trend-radar/types";

/** 화면에 표시할 수 있는 수집 채널. sources 테이블의 code와 같은 값을 쓴다. */
const DISPLAYABLE_SOURCES = ["github", "hacker_news", "product_hunt", "reddit", "threads", "instagram"] as const;
const DISPLAYABLE = new Set<string>(DISPLAYABLE_SOURCES);

const SOURCE_NAMES: Record<string, string> = {
  github: "GitHub",
  hacker_news: "Hacker News",
  product_hunt: "Product Hunt",
  reddit: "Reddit",
  threads: "Threads",
  instagram: "Instagram",
};

/**
 * 엔티티가 실제로 관측된 수집 채널 목록을 화면용으로 정리한다.
 *
 * 예전에는 `github_url ? ["github"] : ["hacker_news"]`로 추측했다. 채널이 두 개였을 때는 맞았지만
 * Product Hunt·Reddit이 추가된 뒤로는 사실과 다른 출처를 사용자에게 보여줬다. 특히 github_url은
 * "GitHub 수집기가 찾았다"는 뜻이 아니라 "GitHub 저장소가 있다"는 뜻이어서(HN에 공유된 저장소도
 * 채워진다) 애초에 채널 판별 근거가 될 수 없었다.
 *
 * 이제 파이프라인이 저장 시점에 남기는 entities.source_codes를 그대로 쓴다. 값이 비어 있는 행
 * (백필 이전 데이터)만 최소한의 추정으로 메운다.
 */
export function resolveSources(sourceCodes: readonly string[], githubUrl: string | null): SourceCode[] {
  const known = [...new Set(sourceCodes)].filter((code) => DISPLAYABLE.has(code)).sort();
  if (known.length > 0) return known as SourceCode[];
  // source_codes가 비어 있을 때만 쓰는 하위 호환 경로.
  return githubUrl ? ["github"] : ["hacker_news"];
}

export function sourceDisplayName(source: string): string {
  return SOURCE_NAMES[source] ?? source;
}

export function sourceSignalLabel(source: SourceCode): string {
  return `${sourceDisplayName(source)} 감지 점수`;
}

/**
 * 실제 관측된 채널들을 "GitHub·Hacker News·Product Hunt" 형태의 문구로 묶는다.
 *
 * 화면에서 수집 채널을 이야기하는 문구는 하드코딩하지 말고 이걸 쓴다. 예전엔 홈 화면 세 곳
 * (제목·순위 안내·FAQ)이 각각 채널 이름을 직접 적어두어, Product Hunt를 붙인 뒤 한 곳만 갱신되고
 * 나머지는 "GitHub·Hacker News"에 머물러 서로 어긋났다. 반대로 Reddit은 API 승인이 거절돼
 * 실제로 수집되지 않으므로, 채널 목록을 미리 적어두면 없는 출처를 광고하게 된다.
 */
export function collectionChannelsLabel(sources: Iterable<string>): string {
  return [...new Set(sources)].sort().map(sourceDisplayName).join("·");
}
