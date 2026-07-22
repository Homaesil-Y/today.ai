import {
  Bell,
  Bookmark,
  ChartNoAxesCombined,
  ChevronRight,
  Compass,
  FileText,
  GitCompareArrows,
  LayoutDashboard,
  Search,
  Settings,
  Shapes,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import type { ReactNode } from "react";
import { getCurrentUserRole } from "@/lib/auth";
import { AuthControl } from "./auth-control";

const nav = [
  { label: "오늘의 레이더", href: "/", icon: LayoutDashboard },
  { label: "트렌드 탐색", href: "/explore", icon: Compass },
  { label: "카테고리", href: "/categories", icon: Shapes },
  { label: "서비스 비교", href: "/compare", icon: GitCompareArrows },
  { label: "관심 목록", href: "/watchlist", icon: Bookmark },
  { label: "리포트", href: "/reports", icon: FileText },
] as const;

export async function AppShell({ children }: { children: ReactNode }) {
  const { role } = await getCurrentUserRole();
  return (
    <div className="app-shell">
      <header className="app-header">
        <Link className="brand" href="/" aria-label="오늘의 AI 홈">
          <span className="brand-mark"><Sparkles size={21} aria-hidden="true" /></span>
          <span className="brand-copy">
            <strong>오늘의 AI</strong>
          </span>
        </Link>
        <form className="global-search" action="/explore" role="search">
          <button type="submit" aria-label="검색"><Search size={18} aria-hidden="true" /></button>
          <label className="sr-only" htmlFor="global-search-input">서비스 통합 검색</label>
          <input id="global-search-input" name="q" type="search" placeholder="서비스, 카테고리 검색" />
        </form>
        <div className="header-actions">
          <button className="icon-button" type="button" aria-label="알림 열기"><Bell size={19} /></button>
          <AuthControl />
        </div>
      </header>

      <aside className="sidebar" aria-label="주요 탐색">
        <nav>
          {nav.map(({ label, href, icon: Icon }, index) => (
            <Link key={href} className={`nav-link ${index === 0 ? "active" : ""}`} href={href}>
              <Icon size={19} aria-hidden="true" /><span>{label}</span>{index === 0 && <ChevronRight className="nav-arrow" size={16} />}
            </Link>
          ))}
        </nav>
        <div className="sidebar-foot">
          {role === "admin" && <Link className="nav-link" href={"/admin/review" as Route}><ShieldCheck size={19} /><span>후보 검토</span></Link>}
          <Link className="nav-link" href="/settings"><Settings size={19} /><span>설정</span></Link>
          <div className="data-status"><span className="status-dot" />Supabase 연동 정상<small>GitHub · Hacker News</small></div>
        </div>
      </aside>

      <main className="main-content">{children}</main>

      <nav className="mobile-nav" aria-label="모바일 주요 탐색">
        {nav.slice(0, 4).map(({ label, href, icon: Icon }, index) => (
          <Link key={href} href={href} className={index === 0 ? "active" : ""}><Icon size={20} /><span>{label.replace("오늘의 ", "")}</span></Link>
        ))}
        {role === "admin"
          ? <Link href={"/admin/review" as Route}><ShieldCheck size={20} /><span>후보 검토</span></Link>
          : <Link href="/settings"><ChartNoAxesCombined size={20} /><span>더보기</span></Link>}
      </nav>
    </div>
  );
}
