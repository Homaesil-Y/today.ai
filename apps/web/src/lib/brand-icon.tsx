import type { ReactElement } from "react";

// 브랜드 아이콘(그라디언트 배경 + 스파클)을 PNG로 렌더링하기 위한 공용 엘리먼트.
// glyphScale: 아이콘 대비 스파클 비율. maskable은 안전영역(중앙 80%) 안에 들어오도록 작게 준다.
export function brandIconElement(glyphScale = 0.6): ReactElement {
  const glyph = `${Math.round(glyphScale * 100)}%`;
  return (
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
      <svg width={glyph} height={glyph} viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M32 13c1.8 8.8 5.2 15.2 16 18-10.8 2.8-14.2 9.2-16 18-1.8-8.8-5.2-15.2-16-18 10.8-2.8 14.2-9.2 16-18Z"
          fill="white"
        />
        <circle cx="48" cy="16" r="3" fill="white" fillOpacity="0.9" />
      </svg>
    </div>
  );
}
