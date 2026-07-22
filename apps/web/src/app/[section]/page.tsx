import Link from "next/link";
import type { Metadata } from "next";

const labels: Record<string, string> = { categories: "카테고리", compare: "서비스 비교", watchlist: "관심 목록", reports: "리포트", settings: "설정" };

export async function generateMetadata({ params }: { params: Promise<{ section: string }> }): Promise<Metadata> {
  const { section } = await params;
  return { title: labels[section] ?? "준비 중", robots: { index: false, follow: false } };
}

export default async function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const label = labels[section] ?? "준비 중";
  return <div className="page"><section className="page-heading"><div><p className="eyebrow">PHASED DELIVERY</p><h1>{label}</h1><p>화면 구조와 권한 경계는 준비되어 있으며, 실제 데이터 기능은 구현 로드맵에 따라 연결됩니다.</p></div></section><div className="empty-state"><span className="brand-mark">+</span><h2>{label} 기능을 준비하고 있습니다</h2><p>미완성 기능을 동작하는 것처럼 표시하지 않습니다. 현재는 오늘의 TOP 10과 서비스 상세를 확인할 수 있습니다.</p><Link className="button button-primary" href="/">오늘의 레이더 보기</Link></div></div>;
}
