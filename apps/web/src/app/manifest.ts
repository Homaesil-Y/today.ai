import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "오늘의 AI",
    short_name: "오늘의 AI",
    description: "오늘 뜨는 AI 서비스를 신호와 근거로 확인하세요.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#f6f7f9",
    theme_color: "#6d5dfb",
    lang: "ko-KR",
    dir: "ltr",
    categories: ["news", "productivity", "business"],
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "트렌드 탐색", short_name: "탐색", url: "/explore" },
      { name: "오늘의 리포트", short_name: "리포트", url: "/reports" },
    ],
  };
}
