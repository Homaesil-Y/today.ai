import type { SourceCode } from "@ai-trend-radar/types";

/** 화면에 표시할 수 있는 수집 채널. sources 테이블의 code와 같은 값을 쓴다. */
const DISPLAYABLE_SOURCES = ["github", "hacker_news", "product_hunt", "reddit", "threads", "instagram"] as const;
const DISPLAYABLE = new Set<string>(DISPLAYABLE_SOURCES);

const SOURCE_LABELS: Record<string, string> = {
  github: "GitHub 감지 점수",
  hacker_news: "Hacker News 감지 점수",
  product_hunt: "Product Hunt 감지 점수",
  reddit: "Reddit 감지 점수",
  threads: "Threads 감지 점수",
  instagram: "Instagram 감지 점수",
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

export function sourceSignalLabel(source: SourceCode): string {
  return SOURCE_LABELS[source] ?? `${source} 감지 점수`;
}
