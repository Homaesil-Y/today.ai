import type { Metadata, Viewport } from "next";
import { AppShell } from "@/components/app-shell";
import { PwaRegister } from "@/components/pwa-register";
import { StructuredData } from "@/components/structured-data";
import { absoluteUrl, siteConfig } from "@/lib/site";
import "pretendard/dist/web/static/pretendard.css";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  applicationName: siteConfig.name,
  title: { default: "오늘의AI", template: "%s | 오늘의AI" },
  description: siteConfig.description,
  keywords: ["AI 트렌드", "AI 서비스", "AI 도구", "생성형 AI", "AI 에이전트", "오픈소스 AI", "GitHub 트렌드", "오늘의AI"],
  authors: [{ name: siteConfig.name, url: siteConfig.url }],
  creator: siteConfig.name,
  publisher: siteConfig.name,
  category: "technology",
  alternates: { canonical: "/", languages: { "ko-KR": "/" } },
  openGraph: {
    title: siteConfig.name,
    description: siteConfig.shortDescription,
    url: siteConfig.url,
    siteName: siteConfig.name,
    locale: siteConfig.locale,
    type: "website",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "오늘의 AI 트렌드 레이더" }],
  },
  twitter: {
    card: "summary_large_image",
    title: siteConfig.name,
    description: siteConfig.shortDescription,
    images: ["/opengraph-image"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 },
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "오늘의AI", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#6d5dfb",
  colorScheme: "light",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const organization = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": absoluteUrl("/#organization"),
    name: siteConfig.name,
    url: siteConfig.url,
    logo: absoluteUrl("/icon.svg"),
    description: siteConfig.description,
  };
  const website = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": absoluteUrl("/#website"),
    name: siteConfig.name,
    url: siteConfig.url,
    inLanguage: siteConfig.language,
    description: siteConfig.description,
    publisher: { "@id": absoluteUrl("/#organization") },
  };
  return <html lang="ko"><body><StructuredData data={[organization, website]} /><PwaRegister /><AppShell>{children}</AppShell></body></html>;
}
