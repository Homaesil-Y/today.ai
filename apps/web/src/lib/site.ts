const fallbackUrl = "https://oh-ai-news.vercel.app";

export const siteConfig = {
  name: "오늘의AI",
  url: (process.env.NEXT_PUBLIC_APP_URL ?? fallbackUrl).replace(/\/$/, ""),
  // 채널 이름을 넣지 않는다. 정적 메타데이터라 DB에서 도출할 수 없어, 채널이 늘거나 막히면
  // 그대로 낡는다(화면 문구는 collectionChannelsLabel로 실제 데이터에서 만든다).
  description:
    "공개 채널의 최신 신호를 분석해 지금 주목받는 AI 서비스를 한국어로 설명하는 트렌드 인텔리전스 서비스입니다.",
  shortDescription: "오늘 뜨는 AI 서비스를 신호와 근거로 확인하세요.",
  locale: "ko_KR",
  language: "ko-KR",
} as const;

export function absoluteUrl(path = "/") {
  return new URL(path, `${siteConfig.url}/`).toString();
}

