"use client";

import { useEffect, useRef, useState } from "react";

// 온보딩·설정에서 공유하는 관심 카테고리 선택 그리드.
// 전체 선택 토글이 필요해 클라이언트 컴포넌트로 두고, 체크 상태를 직접 관리한다.
export function CategoryChoiceGrid({
  categories,
  selected = [],
  className = "",
}: {
  categories: { name: string; slug: string }[];
  selected?: string[];
  className?: string;
}) {
  const [checked, setChecked] = useState<Set<string>>(() => new Set(selected));
  const allRef = useRef<HTMLInputElement>(null);

  const allChecked = categories.length > 0 && checked.size === categories.length;
  const partiallyChecked = checked.size > 0 && !allChecked;

  // 일부만 선택된 상태는 HTML 속성으로 표현할 수 없어 DOM 프로퍼티로 직접 설정한다.
  useEffect(() => {
    if (allRef.current) allRef.current.indeterminate = partiallyChecked;
  }, [partiallyChecked]);

  function toggleAll(next: boolean) {
    setChecked(next ? new Set(categories.map((category) => category.slug)) : new Set());
  }

  function toggleOne(slug: string, next: boolean) {
    setChecked((previous) => {
      const updated = new Set(previous);
      if (next) updated.add(slug);
      else updated.delete(slug);
      return updated;
    });
  }

  return (
    <>
      <div className="choice-toolbar">
        <label className="choice-select-all">
          <input
            ref={allRef}
            type="checkbox"
            checked={allChecked}
            onChange={(event) => toggleAll(event.target.checked)}
          />
          <span>전체 선택</span>
        </label>
      </div>
      <div className={`choice-grid ${className}`.trim()}>
        {categories.map((category) => (
          <label className="choice-card" key={category.slug}>
            <input
              type="checkbox"
              name="categories"
              value={category.slug}
              checked={checked.has(category.slug)}
              onChange={(event) => toggleOne(category.slug, event.target.checked)}
            />
            <span>{category.name}</span>
          </label>
        ))}
      </div>
    </>
  );
}
