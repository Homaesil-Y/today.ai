import { Check, ExternalLink, EyeOff, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { getCurrentUserRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { approveCandidate, rejectCandidate } from "./actions";
import { SourcePreviewDialog } from "./source-preview-dialog";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ q?: string; analysis?: string }> };

function getCategoryName(value: unknown) {
  if (Array.isArray(value)) {
    const first = value[0] as { name?: unknown } | undefined;
    return typeof first?.name === "string" ? first.name : "기타";
  }
  if (value && typeof value === "object" && "name" in value) {
    const name = (value as { name?: unknown }).name;
    return typeof name === "string" ? name : "기타";
  }
  return "기타";
}

function plainTextPreview(value: string | null, maxLength = 240) {
  if (!value) return "설명이 없습니다.";
  const plain = value
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, "&")
    .replace(/&#x2F;/gi, "/")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > maxLength ? `${plain.slice(0, maxLength).trimEnd()}…` : plain;
}

type RawSource = { title: string; body: string | null; url: string; author_name: string | null; published_at: string | null };

function getPrimarySource(value: unknown): RawSource | null {
  if (!Array.isArray(value)) return null;
  const mentions = value
    .map((mention) => {
      if (!mention || typeof mention !== "object") return null;
      const confidence = "confidence" in mention ? Number(mention.confidence) : 0;
      const related = "raw_items" in mention ? mention.raw_items : null;
      const item = Array.isArray(related) ? related[0] : related;
      if (!item || typeof item !== "object" || !("title" in item) || !("url" in item)) return null;
      return { confidence, item: item as RawSource };
    })
    .filter((entry): entry is { confidence: number; item: RawSource } => entry !== null)
    .sort((a, b) => b.confidence - a.confidence);
  return mentions[0]?.item ?? null;
}

export default async function AdminReviewPage({ searchParams }: Props) {
  const { user, role } = await getCurrentUserRole();
  if (!user) redirect("/login?next=/admin/review");
  if (role !== "admin") redirect("/");

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("entities")
    .select("id, name, slug, description, canonical_url, github_url, is_open_source, first_detected_at, categories(name), trend_scores(total_score, trust_score, status, calculated_at), ai_analyses(id, summary, generated_at), entity_mentions(confidence, raw_items(title, body, url, author_name, published_at))")
    .eq("visibility", "review")
    .order("first_detected_at", { ascending: false });

  if (error) throw new Error(`검토 후보 조회 실패: ${error.message}`);
  const candidates = data ?? [];
  const params = await searchParams;
  const query = params.q?.trim().toLocaleLowerCase("ko-KR") ?? "";
  const analysisOnly = params.analysis === "ready";
  const preparedCandidates = candidates
    .map((candidate) => {
      const scores = [...(candidate.trend_scores ?? [])].sort((a, b) => b.calculated_at.localeCompare(a.calculated_at));
      const analyses = [...(candidate.ai_analyses ?? [])].sort((a, b) => b.generated_at.localeCompare(a.generated_at));
      return { candidate, score: scores[0], analysisReady: Boolean(analyses.length), analysisSummary: analyses[0]?.summary ?? null, source: getPrimarySource(candidate.entity_mentions) };
    })
    .sort((a, b) => Number(b.analysisReady) - Number(a.analysisReady) || Number(b.score?.total_score ?? 0) - Number(a.score?.total_score ?? 0))
    .filter(({ candidate, analysisReady }) => {
      if (analysisOnly && !analysisReady) return false;
      if (!query) return true;
      const haystack = [candidate.name, candidate.description, candidate.canonical_url, getCategoryName(candidate.categories)].filter(Boolean).join(" ").toLocaleLowerCase("ko-KR");
      return haystack.includes(query);
    });

  return (
    <div className="page admin-page">
      <section className="page-heading">
        <div><h1>AI 서비스 후보 검토</h1><p>수집·분석된 후보를 확인하고 공개 여부를 결정하세요.</p></div>
        <div className="admin-summary"><ShieldCheck size={18} /><strong>{candidates.length}</strong><span>검토 대기</span></div>
      </section>

      <form className="admin-toolbar" action="/admin/review" method="get">
        <label><span className="sr-only">후보 검색</span><input type="search" name="q" defaultValue={params.q ?? ""} placeholder="서비스명, 도메인, 카테고리 검색" /></label>
        <label><span className="sr-only">AI 분석 상태</span><select name="analysis" defaultValue={analysisOnly ? "ready" : "all"}><option value="all">전체 분석 상태</option><option value="ready">AI 분석 완료만</option></select></label>
        <button className="button button-secondary" type="submit">필터 적용</button>
        <span>결과 {preparedCandidates.length}건</span>
      </form>

      {preparedCandidates.length === 0 ? (
        <section className="empty-state"><Check size={30} /><h2>{candidates.length ? "검색 결과가 없습니다" : "검토할 후보가 없습니다"}</h2><p>{candidates.length ? "검색어나 분석 필터를 변경해보세요." : "모든 후보의 처리가 완료됐습니다."}</p></section>
      ) : (
        <section className="review-list" aria-label="검토 대기 후보">
          {preparedCandidates.map(({ candidate, score, analysisReady, analysisSummary, source }) => {
            return (
              <article className="review-card" key={candidate.id}>
                <div className="review-main">
                  <div className="review-title"><span className="category-chip">{getCategoryName(candidate.categories)}</span>{candidate.is_open_source && <span className="category-chip">오픈소스</span>}{analysisReady ? <span className="analysis-ready">AI 분석 완료</span> : <span className="analysis-waiting">AI 분석 대기</span>}</div>
                  <h2>{candidate.name}</h2>
                  <p className="review-description">{analysisReady ? plainTextPreview(analysisSummary) : "한국어 AI 분석을 기다리고 있습니다. 수집 원문은 아래 버튼에서 확인할 수 있습니다."}</p>
                  <div className="review-links">
                    <SourcePreviewDialog
                      serviceName={candidate.name}
                      title={source?.title ?? candidate.name}
                      body={plainTextPreview(source?.body ?? candidate.description, 3000)}
                      url={source?.url ?? candidate.canonical_url}
                      author={source?.author_name ?? null}
                      publishedAt={source?.published_at ?? candidate.first_detected_at}
                    />
                    {candidate.github_url && <a href={candidate.github_url} target="_blank" rel="noreferrer">GitHub <ExternalLink size={14} /></a>}
                  </div>
                </div>
                <div className="review-score"><span>Trend</span><strong>{Number(score?.total_score ?? 0).toFixed(1)}</strong><small>신뢰도 {Number(score?.trust_score ?? 0).toFixed(0)}</small></div>
                <div className="review-actions">
                  <form action={approveCandidate}><input type="hidden" name="entityId" value={candidate.id} /><button className="button button-primary" type="submit" disabled={!analysisReady} title={analysisReady ? "검토 후 공개" : "AI 분석 완료 후 공개할 수 있습니다"}><Check size={16} />{analysisReady ? "승인·공개" : "분석 후 승인"}</button></form>
                  <form action={rejectCandidate}><input type="hidden" name="entityId" value={candidate.id} /><button className="button button-secondary" type="submit"><EyeOff size={16} />보류</button></form>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
