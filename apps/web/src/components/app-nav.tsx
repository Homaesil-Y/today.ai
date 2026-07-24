"use client";

import {
  Bookmark,
  ChevronRight,
  Compass,
  FileText,
  Gauge,
  GitCompareArrows,
  LayoutDashboard,
  Menu,
  Newspaper,
  Settings,
  Shapes,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { pageTypeFor, trackEvent } from "@/lib/analytics";

// PC 사이드바 순서: 서비스 비교 → 관심 목록 → AI 뉴스 → 리포트
const nav = [
  { label: "오늘의 레이더", href: "/", icon: LayoutDashboard },
  { label: "트렌드 탐색", href: "/explore", icon: Compass },
  { label: "카테고리", href: "/categories", icon: Shapes },
  { label: "서비스 비교", href: "/compare", icon: GitCompareArrows },
  { label: "관심 목록", href: "/watchlist", icon: Bookmark },
  { label: "AI 뉴스", href: "/news", icon: Newspaper },
  { label: "리포트", href: "/reports", icon: FileText },
] as const;

// 모바일 하단 바 기본 탭: 서비스 비교 자리에 AI 뉴스를 노출한다.
const mobilePrimary = [
  { label: "레이더", href: "/", icon: LayoutDashboard },
  { label: "트렌드 탐색", href: "/explore", icon: Compass },
  { label: "카테고리", href: "/categories", icon: Shapes },
  { label: "AI 뉴스", href: "/news", icon: Newspaper },
] as const;

function useIsActive() {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));
  return { isActive, pathname };
}

function trackNavClick(pathname: string, label: string) {
  trackEvent("select_content", { content_type: "nav", item_id: label, page_type: pageTypeFor(pathname) });
}

export function SidebarNavLinks({ isAdmin }: { isAdmin: boolean }) {
  const { isActive, pathname } = useIsActive();
  return (
    <>
      <nav>
        {nav.map(({ label, href, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link key={href} className={`nav-link ${active ? "active" : ""}`} href={href} onClick={() => trackNavClick(pathname, label)}>
              <Icon size={19} aria-hidden="true" /><span>{label}</span>{active && <ChevronRight className="nav-arrow" size={16} />}
            </Link>
          );
        })}
      </nav>
      <div className="sidebar-foot">
        {isAdmin && <Link className={`nav-link ${isActive("/admin/review") ? "active" : ""}`} href={"/admin/review" as Route}><ShieldCheck size={19} /><span>후보 검토</span></Link>}
        {isAdmin && <Link className={`nav-link ${isActive("/admin/categories") ? "active" : ""}`} href={"/admin/categories" as Route}><Shapes size={19} /><span>카테고리 제안</span></Link>}
        {isAdmin && <Link className={`nav-link ${isActive("/admin/ops") ? "active" : ""}`} href={"/admin/ops" as Route}><Gauge size={19} /><span>운영 현황</span></Link>}
        <Link className={`nav-link ${isActive("/settings") ? "active" : ""}`} href="/settings" onClick={() => trackNavClick(pathname, "설정")}><Settings size={19} /><span>설정</span></Link>
      </div>
    </>
  );
}

type MoreItem = { label: string; href: Route; icon: typeof Bookmark };

export function MobileNavLinks({ isAdmin }: { isAdmin: boolean }) {
  const { isActive, pathname } = useIsActive();
  const [moreOpen, setMoreOpen] = useState(false);

  // 하단 바에는 상단 4개만 노출하고, 나머지는 "더보기" 시트로 모은다.
  // (시트는 항목 탭·배경 탭 시 닫힌다.)
  const moreItems: MoreItem[] = [
    { label: "서비스 비교", href: "/compare" as Route, icon: GitCompareArrows },
    { label: "관심 목록", href: "/watchlist" as Route, icon: Bookmark },
    { label: "리포트", href: "/reports" as Route, icon: FileText },
    ...(isAdmin
      ? ([
          { label: "후보 검토", href: "/admin/review" as Route, icon: ShieldCheck },
          { label: "카테고리 제안", href: "/admin/categories" as Route, icon: Shapes },
          { label: "운영 현황", href: "/admin/ops" as Route, icon: Gauge },
        ] satisfies MoreItem[])
      : []),
    { label: "설정", href: "/settings" as Route, icon: Settings },
  ];
  const moreActive = moreItems.some(({ href }) => isActive(href));

  return (
    <>
      {moreOpen && <div className="mobile-more-backdrop" onClick={() => setMoreOpen(false)} aria-hidden="true" />}
      {moreOpen && (
        <div className="mobile-more-sheet" role="menu" aria-label="더보기 메뉴">
          {moreItems.map(({ label, href, icon: Icon }) => (
            <Link key={href} href={href} role="menuitem" className={`mobile-more-item ${isActive(href) ? "active" : ""}`} onClick={() => { setMoreOpen(false); trackNavClick(pathname, label); }}>
              <Icon size={19} aria-hidden="true" /><span>{label}</span><ChevronRight size={16} className="mobile-more-arrow" />
            </Link>
          ))}
        </div>
      )}
      <nav className="mobile-nav" aria-label="모바일 주요 탐색">
        {mobilePrimary.map(({ label, href, icon: Icon }) => (
          <Link key={href} href={href} className={isActive(href) ? "active" : ""} onClick={() => { setMoreOpen(false); trackNavClick(pathname, label); }}><Icon size={20} /><span>{label}</span></Link>
        ))}
        <button
          type="button"
          className={`mobile-more-trigger ${moreOpen || moreActive ? "active" : ""}`}
          aria-haspopup="menu"
          aria-expanded={moreOpen}
          onClick={() => {
            if (!moreOpen) trackEvent("open_more_menu", { page_type: pageTypeFor(pathname) });
            setMoreOpen(!moreOpen);
          }}
        >
          <Menu size={20} /><span>더보기</span>
        </button>
      </nav>
    </>
  );
}
