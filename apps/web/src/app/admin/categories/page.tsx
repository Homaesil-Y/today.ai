import { Lightbulb, Shapes } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentUserRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { SuggestionActions } from "./suggestion-actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "카테고리 제안", robots: { index: false, follow: false } };

const suggestionSchema = z.object({
  id: z.string(),
  slug: z.string(),
  label: z.string(),
  rationale: z.string().nullable(),
  example_names_json: z.array(z.string()).catch([]),
  service_count: z.number().catch(0),
});

export default async function AdminCategoriesPage() {
  const { role } = await getCurrentUserRole();
  if (role !== "admin") redirect("/");

  const supabase = createAdminClient();
  const [{ data: catData }, suggestionResult] = await Promise.all([
    supabase.from("categories").select("name,slug").eq("enabled", true).order("sort_order"),
    supabase.from("category_suggestions").select("id,slug,label,rationale,example_names_json,service_count").eq("status", "pending").order("service_count", { ascending: false }),
  ]);
  const categories = (catData ?? []) as { name: string; slug: string }[];
  // 테이블 미생성(마이그레이션 전) 등으로 조회 실패해도 빈 목록으로 안전하게 렌더.
  const suggestions = suggestionResult.error ? [] : z.array(suggestionSchema).catch([]).parse(suggestionResult.data ?? []);

  return (
    <div className="page content-page">
      <section className="page-heading">
        <div>
          <h1>카테고리 제안</h1>
          <p>‘기타’로 분류된 서비스에서 발견한 새 분류 후보입니다. 승인하면 즉시 분류 체계에 추가되고, 다음 분석부터 사용됩니다.</p>
        </div>
      </section>

      <section className="panel">
        <div className="preference-title"><Shapes size={20} /><div><h2>현재 카테고리 <span className="admin-count">{categories.length}개</span></h2></div></div>
        <div className="category-chip-row">{categories.map((c) => <span className="category-chip" key={c.slug}>{c.name}</span>)}</div>
      </section>

      <section className="section-block">
        <div className="section-heading"><div><h2>대기 중인 제안 <span className="admin-count">{suggestions.length}건</span></h2></div></div>
        {suggestions.length === 0 ? (
          <div className="empty-state">
            <Lightbulb size={30} />
            <h2>대기 중인 제안이 없습니다</h2>
            <p>‘기타’ 서비스가 충분히 쌓이면 자동으로 새 카테고리 후보를 제안합니다. 수동 실행: <code>pnpm suggest:categories</code></p>
          </div>
        ) : (
          <div className="suggestion-list">
            {suggestions.map((s) => (
              <article className="panel suggestion-card" key={s.id}>
                <div className="suggestion-head">
                  <div><strong>{s.label}</strong><code>{s.slug}</code></div>
                  <span className="suggestion-count">서비스 {s.service_count}개</span>
                </div>
                {s.rationale && <p className="suggestion-rationale">{s.rationale}</p>}
                {s.example_names_json.length > 0 && (
                  <div className="suggestion-examples">{s.example_names_json.slice(0, 8).map((name, i) => <span key={i}>{name}</span>)}</div>
                )}
                <SuggestionActions id={s.id} />
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
