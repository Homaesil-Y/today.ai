"use client";

import { Bookmark, Check } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setWatchlistItem } from "@/app/watchlist/actions";
import { pageTypeFor, trackEvent } from "@/lib/analytics";

export function WatchButton({ entityId, slug, compact = false, initialSaved = false }: { entityId: string; slug?: string; compact?: boolean; initialSaved?: boolean }) {
  const [saved, setSaved] = useState(initialSaved);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const pathname = usePathname();
  const router = useRouter();
  function toggle() {
    const previous = saved;
    const desired = !saved;
    setSaved(desired);
    setMessage(null);
    startTransition(async () => {
      const result = await setWatchlistItem(entityId, desired);
      if (!result.ok) {
        setSaved(previous);
        setMessage(result.message);
        if (result.requiresAuth) router.push(`/login?next=${encodeURIComponent(pathname)}`);
        return;
      }
      setSaved(result.saved);
      trackEvent("save_watchlist", { page_type: pageTypeFor(pathname), saved: result.saved, ...(slug ? { service_slug: slug } : {}) });
      router.refresh();
    });
  }
  return (
    <button className={compact ? "icon-button" : "button button-secondary"} type="button" aria-pressed={saved} aria-label={message ?? (saved ? "관심 목록에서 제거" : "관심 목록에 저장")} title={message ?? undefined} onClick={toggle} disabled={pending}>
      {saved ? <Check size={18} aria-hidden="true" /> : <Bookmark size={18} aria-hidden="true" />}
      {!compact && <span>{pending ? "저장 중…" : saved ? "저장됨" : "관심 등록"}</span>}
    </button>
  );
}
