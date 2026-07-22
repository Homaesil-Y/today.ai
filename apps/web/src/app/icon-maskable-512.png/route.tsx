import { ImageResponse } from "next/og";
import { brandIconElement } from "@/lib/brand-icon";

// PWA 매니페스트용 512x512 maskable PNG. 스파클을 작게(안전영역 안) 배치한다.
export function GET() {
  return new ImageResponse(brandIconElement(0.44), { width: 512, height: 512 });
}
