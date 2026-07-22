const fallbackUrl = "https://oh-ai-news.vercel.app";

export const siteConfig = {
  name: "오늘의 AI",
  url: (process.env.NEXT_PUBLIC_APP_URL ?? fallbackUrl).replace(/\/$/, ""),
  description:
    "GitHub과 Hacker News의 최신 신호를 분석해 지금 주목받는 AI 서비스를 한국어로 설명하는 트렌드 인텔리전스 서비스입니다.",
  shortDescription: "오늘 뜨는 AI 서비스를 신호와 근거로 확인하세요.",
  locale: "ko_KR",
  language: "ko-KR",
} as const;

export function absoluteUrl(path = "/") {
  return new URL(path, `${siteConfig.url}/`).toString();
}

