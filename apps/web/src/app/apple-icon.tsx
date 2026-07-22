import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// iOS 홈 화면 아이콘(apple-touch-icon). 브랜드 그라디언트 + 스파클을 PNG로 렌더링한다.
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #6D5DFB, #17BFD3)",
        }}
      >
        <svg width="112" height="112" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M32 13c1.8 8.8 5.2 15.2 16 18-10.8 2.8-14.2 9.2-16 18-1.8-8.8-5.2-15.2-16-18 10.8-2.8 14.2-9.2 16-18Z"
            fill="white"
          />
          <circle cx="48" cy="16" r="3" fill="white" fillOpacity="0.9" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
