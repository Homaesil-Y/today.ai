import { ImageResponse } from "next/og";
import { getPublishedTrend } from "@/data/live-trends";

export const alt = "오늘의 AI 서비스 트렌드 분석";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function ServiceOpenGraphImage({ params }: { params: Promise<{ slug: string }> }) {
  const trend = await getPublishedTrend((await params).slug);
  const name = trend?.name ?? "오늘의 AI";
  const description = trend?.tagline ?? "오늘 뜨는 AI 서비스를 신호와 근거로 확인하세요.";
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "68px 76px", color: "#171a21", background: "#f6f7f9", fontFamily: "Arial, sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}><div style={{ width: 54, height: 54, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 15, color: "white", fontSize: 21, fontWeight: 800, background: "linear-gradient(135deg, #6d5dfb, #17bfd3)" }}>AI</div><span style={{ fontSize: 28, fontWeight: 700 }}>오늘의 AI</span></div>
        {trend && <div style={{ display: "flex", padding: "10px 18px", borderRadius: 999, color: "#4938d1", background: "#f0eeff", fontSize: 20, fontWeight: 700 }}>{trend.category}</div>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ display: "flex", color: "#6d5dfb", fontSize: 22, fontWeight: 700, letterSpacing: 2 }}>AI SERVICE TREND REPORT</div>
        <div style={{ display: "flex", maxWidth: 990, fontSize: name.length > 38 ? 52 : 68, lineHeight: 1.08, fontWeight: 800, letterSpacing: -2 }}>{name}</div>
        <div style={{ display: "flex", maxWidth: 980, color: "#667085", fontSize: 25, lineHeight: 1.45 }}>{description.slice(0, 150)}</div>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", paddingTop: 24, borderTop: "2px solid #e5e7eb" }}>
        <span style={{ color: "#667085", fontSize: 20 }}>신호와 근거로 보는 AI 트렌드</span>
        {trend && <div style={{ display: "flex", gap: 34 }}><div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}><span style={{ color: "#667085", fontSize: 16 }}>TREND</span><strong style={{ fontSize: 44 }}>{trend.trendScore}</strong></div><div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}><span style={{ color: "#667085", fontSize: 16 }}>TRUST</span><strong style={{ color: "#15803d", fontSize: 44 }}>{trend.trustScore}</strong></div></div>}
      </div>
    </div>,
    size,
  );
}
