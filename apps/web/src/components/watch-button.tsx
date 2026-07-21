"use client";

import { Bookmark, Check } from "lucide-react";
import { useState } from "react";

export function WatchButton({ compact = false }: { compact?: boolean }) {
  const [saved, setSaved] = useState(false);
  return (
    <button className={compact ? "icon-button" : "button button-secondary"} type="button" aria-pressed={saved} aria-label={saved ? "관심 목록에서 제거" : "관심 목록에 저장"} onClick={() => setSaved((value) => !value)}>
      {saved ? <Check size={18} aria-hidden="true" /> : <Bookmark size={18} aria-hidden="true" />}
      {!compact && <span>{saved ? "저장됨" : "관심 등록"}</span>}
    </button>
  );
}
