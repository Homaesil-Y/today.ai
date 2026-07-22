import { Bell, Search, Sparkles } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { getCurrentUserRole } from "@/lib/auth";
import { MobileNavLinks, SidebarNavLinks } from "./app-nav";
import { AuthControl } from "./auth-control";
import { BackToTop } from "./back-to-top";

export async function AppShell({ children }: { children: ReactNode }) {
  const { role } = await getCurrentUserRole();
  const isAdmin = role === "admin";
  return (
    <div className="app-shell">
      <header className="app-header">
        <Link className="brand" href="/" aria-label="오늘의AI 홈">
          <span className="brand-mark"><Sparkles size={21} aria-hidden="true" /></span>
          <span className="brand-copy">
            <strong>오늘의AI</strong>
          </span>
        </Link>
        <form className="global-search" action="/explore" role="search">
          <button type="submit" aria-label="검색"><Search size={18} aria-hidden="true" /></button>
          <label className="sr-only" htmlFor="global-search-input">서비스 통합 검색</label>
          <input id="global-search-input" name="q" type="search" placeholder="서비스, 카테고리 검색" />
        </form>
        <div className="header-actions">
          <Link className="icon-button" href="/settings" aria-label="알림 설정"><Bell size={19} /></Link>
          <AuthControl />
        </div>
      </header>

      <aside className="sidebar" aria-label="주요 탐색">
        <SidebarNavLinks isAdmin={isAdmin} />
      </aside>

      <main className="main-content">{children}</main>

      <BackToTop />
      <MobileNavLinks isAdmin={isAdmin} />
    </div>
  );
}
