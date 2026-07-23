import type { Metadata, Route } from "next";
import Link from "next/link";
import { ArrowRight, Shapes, TrendingUp } from "lucide-react";
import { StructuredData } from "@/components/structured-data";
import { getPublishedTrends } from "@/data/live-trends";
import { summarizeCategories } from "@/data/trend-query";
import { absoluteUrl, siteConfig } from "@/lib/site";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "AI 서비스 카테고리",
  description: "AI 에이전트, 개발·코딩, 이미지, 문서·RAG 등 분야별 최신 AI 서비스 트렌드를 확인하세요.",
  alternates: { canonical: "/categories" },
  openGraph: { title: "AI 서비스 카테고리 | 오늘의AI", description: "분야별 AI 서비스 수와 최고 트렌드 점수를 살펴보세요.", url: "/categories" },
};

export default async function CategoriesPage() {
  const trends = await getPublishedTrends();
  const categories = summarizeCategories(trends);
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "AI 서비스 카테고리",
    url: absoluteUrl("/categories"),
    inLanguage: siteConfig.language,
    mainEntity: { "@type": "ItemList", itemListElement: categories.map((category, index) => ({ "@type": "ListItem", position: index + 1, name: category.name, url: absoluteUrl(`/explore?category=${encodeURIComponent(category.name)}`) })) },
  };
  return <div className="page"><StructuredData data={structuredData} /><section className="page-heading"><div><h1>카테고리</h1><p>분야별 AI 서비스 수와 현재 가장 강한 트렌드 신호를 확인하세요.</p></div></section>{categories.length ? <section className="category-grid">{categories.map((category) => <Link className="category-card" href={`/explore?category=${encodeURIComponent(category.name)}` as Route} key={category.name}><span className="category-icon"><Shapes size={20} /></span><div><h2>{category.name}</h2><p>{category.count}개 서비스</p></div><div className="category-metrics"><span>최고 점수 <strong>{category.topScore}</strong></span>{category.risingCount > 0 && <span><TrendingUp size={14} />상승 {category.risingCount}</span>}</div><ArrowRight className="category-arrow" size={19} /></Link>)}</section> : <section className="empty-state"><Shapes size={30} /><h2>표시할 카테고리가 없습니다</h2><p>공개 서비스가 승인되면 카테고리가 자동으로 구성됩니다.</p></section>}</div>;
}

