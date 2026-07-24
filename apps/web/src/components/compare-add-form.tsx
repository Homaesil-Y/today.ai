"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { useMemo, useState } from "react";
import { Dropdown } from "@/components/dropdown";
import { trackEvent } from "@/lib/analytics";

type Option = { slug: string; name: string; category: string };

// 비교 대상 추가: 1) 카테고리 선택 → 2) 해당 카테고리의 서비스 선택.
export function CompareAddForm({ options, selectedSlugs }: { options: Option[]; selectedSlugs: string[] }) {
  const router = useRouter();
  const [category, setCategory] = useState("");
  const [slug, setSlug] = useState("");

  const categoryOptions = useMemo(
    () =>
      [...new Set(options.map((o) => o.category).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, "ko"))
        .map((name) => ({ value: name, label: name })),
    [options],
  );
  const serviceOptions = useMemo(
    () =>
      (category ? options.filter((o) => o.category === category) : []).map((o) => ({ value: o.slug, label: o.name })),
    [options, category],
  );

  const add = () => {
    if (!slug) return;
    trackEvent("add_to_compare", { service_slug: slug, compare_count: selectedSlugs.length + 1, trigger: "compare_page", page_type: "compare" });
    router.push(`/compare?slugs=${[...selectedSlugs, slug].join(",")}` as Route);
  };

  return (
    <div className="compare-add">
      <Dropdown
        ariaLabel="카테고리 선택"
        placeholder="카테고리 선택"
        value={category}
        options={categoryOptions}
        onChange={(next) => {
          setCategory(next);
          setSlug("");
        }}
      />
      <Dropdown
        ariaLabel="서비스 선택"
        placeholder={category ? "서비스 선택" : "카테고리를 먼저 선택하세요"}
        value={slug}
        options={serviceOptions}
        disabled={!category}
        onChange={setSlug}
      />
      <button className="button button-secondary" type="button" onClick={add} disabled={!slug}>추가</button>
      {selectedSlugs.length > 0 && (
        <Link className="button button-secondary" href="/compare"><X size={15} />전체 해제</Link>
      )}
    </div>
  );
}
