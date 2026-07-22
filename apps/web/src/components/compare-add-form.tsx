"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { useMemo, useState } from "react";

type Option = { slug: string; name: string; category: string };

// 비교 대상 추가: 1) 카테고리 선택 → 2) 해당 카테고리의 서비스 선택.
export function CompareAddForm({ options, selectedSlugs }: { options: Option[]; selectedSlugs: string[] }) {
  const router = useRouter();
  const [category, setCategory] = useState("");
  const [slug, setSlug] = useState("");

  const categories = useMemo(
    () => [...new Set(options.map((o) => o.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko")),
    [options],
  );
  const services = useMemo(
    () => (category ? options.filter((o) => o.category === category) : []),
    [options, category],
  );

  const add = () => {
    if (!slug) return;
    router.push(`/compare?slugs=${[...selectedSlugs, slug].join(",")}` as Route);
  };

  return (
    <div className="compare-add">
      <label className="compare-add-field">
        <span className="sr-only">1단계: 카테고리 선택</span>
        <select
          value={category}
          onChange={(event) => {
            setCategory(event.target.value);
            setSlug("");
          }}
        >
          <option value="" disabled>1. 카테고리 선택…</option>
          {categories.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
      </label>
      <label className="compare-add-field">
        <span className="sr-only">2단계: 서비스 선택</span>
        <select value={slug} onChange={(event) => setSlug(event.target.value)} disabled={!category}>
          <option value="" disabled>{category ? "2. 서비스 선택…" : "카테고리를 먼저 선택하세요"}</option>
          {services.map((option) => <option key={option.slug} value={option.slug}>{option.name}</option>)}
        </select>
      </label>
      <button className="button button-secondary" type="button" onClick={add} disabled={!slug}>추가</button>
      {selectedSlugs.length > 0 && (
        <Link className="button button-secondary" href="/compare"><X size={15} />전체 해제</Link>
      )}
    </div>
  );
}
