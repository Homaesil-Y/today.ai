import { ImageResponse } from "next/og";

export const alt = "오늘의 AI — 오늘 뜨는 AI 서비스 트렌드";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "72px 82px", color: "#171a21", background: "#f6f7f9", fontFamily: "Arial, sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <div style={{ width: 70, height: 70, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 20, color: "white", fontSize: 28, fontWeight: 800, background: "linear-gradient(135deg, #6d5dfb, #17bfd3)" }}>AI</div>
        <div style={{ display: "flex", fontSize: 34, fontWeight: 700 }}>오늘의 AI</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ display: "flex", color: "#6d5dfb", fontSize: 22, fontWeight: 700, letterSpacing: 3 }}>LIVE AI TREND INTELLIGENCE</div>
        <div style={{ display: "flex", maxWidth: 940, fontSize: 68, lineHeight: 1.12, fontWeight: 800, letterSpacing: -3 }}>오늘 뜨는 AI 서비스를<br />신호와 근거로 확인하세요.</div>
        <div style={{ display: "flex", color: "#667085", fontSize: 26 }}>GitHub · Hacker News 데이터와 한국어 AI 분석</div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 24, borderTop: "2px solid #e5e7eb", color: "#667085", fontSize: 20 }}><span>매일 업데이트</span><span>oh-ai-news.vercel.app</span></div>
    </div>,
    size,
  );
}
