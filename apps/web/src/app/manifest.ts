import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "오늘의 AI",
    short_name: "오늘의 AI",
    description: "오늘 뜨는 AI 서비스를 신호와 근거로 확인하세요.",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f7f9",
    theme_color: "#6d5dfb",
    lang: "ko-KR",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
