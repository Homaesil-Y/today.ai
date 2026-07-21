import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import "pretendard/dist/web/static/pretendard.css";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  title: { default: "오늘의 AI", template: "%s | 오늘의 AI" },
  description: "여러 채널의 확산 속도를 분석해 오늘 뜨는 AI 서비스를 설명합니다.",
  openGraph: { title: "오늘의 AI", description: "오늘 뜨는 AI 서비스를 신호와 근거로 확인하세요.", type: "website" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body><AppShell>{children}</AppShell></body></html>;
}
