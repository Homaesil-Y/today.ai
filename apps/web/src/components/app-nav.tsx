"use client";

import {
  Bookmark,
  ChartNoAxesCombined,
  ChevronRight,
  Compass,
  FileText,
  Gauge,
  GitCompareArrows,
  LayoutDashboard,
  Settings,
  Shapes,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";

const nav = [
  { label: "오늘의 레이더", href: "/", icon: LayoutDashboard },
  { label: "트렌드 탐색", href: "/explore", icon: Compass },
  { label: "카테고리", href: "/categories", icon: Shapes },
  { label: "서비스 비교", href: "/compare", icon: GitCompareArrows },
  { label: "관심 목록", href: "/watchlist", icon: Bookmark },
  { label: "리포트", href: "/reports", icon: FileText },
] as const;

function useIsActive() {
  const pathname = usePathname();
  return (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));
}

export function SidebarNavLinks({ isAdmin }: { isAdmin: boolean }) {
  const isActive = useIsActive();
  return (
    <>
      <nav>
        {nav.map(({ label, href, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link key={href} className={`nav-link ${active ? "active" : ""}`} href={href}>
              <Icon size={19} aria-hidden="true" /><span>{label}</span>{active && <ChevronRight className="nav-arrow" size={16} />}
            </Link>
          );
        })}
      </nav>
      <div className="sidebar-foot">
        {isAdmin && <Link className={`nav-link ${isActive("/admin/review") ? "active" : ""}`} href={"/admin/review" as Route}><ShieldCheck size={19} /><span>후보 검토</span></Link>}
        {isAdmin && <Link className={`nav-link ${isActive("/admin/ops") ? "active" : ""}`} href={"/admin/ops" as Route}><Gauge size={19} /><span>운영 현황</span></Link>}
        <Link className={`nav-link ${isActive("/settings") ? "active" : ""}`} href="/settings"><Settings size={19} /><span>설정</span></Link>
        <div className="data-status"><span className="status-dot" />Supabase 연동 정상<small>GitHub · Hacker News · Product Hunt · Reddit</small></div>
      </div>
    </>
  );
}

export function MobileNavLinks({ isAdmin }: { isAdmin: boolean }) {
  const isActive = useIsActive();
  return (
    <nav className="mobile-nav" aria-label="모바일 주요 탐색">
      {nav.slice(0, 4).map(({ label, href, icon: Icon }) => (
        <Link key={href} href={href} className={isActive(href) ? "active" : ""}><Icon size={20} /><span>{label.replace("오늘의 ", "")}</span></Link>
      ))}
      {isAdmin
        ? <Link href={"/admin/review" as Route} className={isActive("/admin/review") ? "active" : ""}><ShieldCheck size={20} /><span>후보 검토</span></Link>
        : <Link href="/settings" className={isActive("/settings") ? "active" : ""}><ChartNoAxesCombined size={20} /><span>더보기</span></Link>}
    </nav>
  );
}
