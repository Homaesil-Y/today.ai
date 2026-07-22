import { ImageResponse } from "next/og";
import { brandIconElement } from "@/lib/brand-icon";

// PWA 매니페스트용 512x512 PNG 아이콘(purpose: any).
export function GET() {
  return new ImageResponse(brandIconElement(0.62), { width: 512, height: 512 });
}
