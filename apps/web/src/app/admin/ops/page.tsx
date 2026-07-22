import type { SourceCode } from "@ai-trend-radar/types";
import { AlertTriangle, CheckCircle2, Clock, Database, Gauge, Layers } from "lucide-react";
import { redirect } from "next/navigation";
import { getCurrentUserRole } from "@/lib/auth";
import { SourceBrandIcon, getSourceLabel } from "@/components/source-brand-icon";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const INGESTED_SOURCES: SourceCode[] = ["github", "hacker_news", "product_hunt", "reddit"];

const RUN_STATUS_LABEL: Record<string, string> = {
  succeeded: "정상",
  partial: "부분/차단",
  failed: "실패",
  running: "실행 중",
};

function formatKst(value: string | null | undefined) {
  if (!value) return "기록 없음";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "기록 없음";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function relativeFromNow(value: string | null | undefined) {
  if (!value) return null;
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return null;
  const diffMinutes = Math.round((Date.now() - then) / 60_000);
  if (diffMinutes < 1) return "방금 전";
  if (diffMinutes < 60) return `${diffMinutes}분 전`;
  const hours = Math.round(diffMinutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.round(hours / 24)}일 전`;
}

type CollectorRun = {
  source_id: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  fetched_count: number;
  inserted_count: number;
  updated_count: number;
  error_count: number;
  rate_limit_remaining: number | null;
  error_log_json: unknown;
};

function firstWarning(log: unknown) {
  if (!Array.isArray(log) || log.length === 0) return null;
  const entry = log[0];
  if (typeof entry === "string") return entry;
  if (entry && typeof entry === "object" && "message" in entry) {
    const message = (entry as { message?: unknown }).message;
    return typeof message === "string" ? message : null;
  }
  return null;
}

export default async function AdminOpsPage() {
  const { user, role } = await getCurrentUserRole();
  if (!user) redirect("/login?next=/admin/ops");
  if (role !== "admin") redirect("/");

  const supabase = createAdminClient();
  const [entitiesResult, analysesResult, sourcesResult, runsResult] = await Promise.all([
    supabase.from("entities").select("id, visibility, ai_analyses(id)"),
    supabase.from("ai_analyses").select("generated_at").order("generated_at", { ascending: false }).limit(1),
    supabase.from("sources").select("id, code, name, enabled, last_collected_at"),
    supabase.from("collector_runs").select("source_id, status, started_at, finished_at, fetched_count, inserted_count, updated_count, error_count, rate_limit_remaining, error_log_json").order("started_at", { ascending: false }).limit(120),
  ]);

  if (entitiesResult.error) throw new Error(`엔티티 집계 실패: ${entitiesResult.error.message}`);
  if (sourcesResult.error) throw new Error(`채널 조회 실패: ${sourcesResult.error.message}`);
  if (runsResult.error) throw new Error(`수집 이력 조회 실패: ${runsResult.error.message}`);

  const entities = entitiesResult.data ?? [];
  const publicCount = entities.filter((entity) => entity.visibility === "public").length;
  const reviewEntities = entities.filter((entity) => entity.visibility === "review");
  const reviewCount = reviewEntities.length;
  const unanalyzedCount = reviewEntities.filter((entity) => (entity.ai_analyses ?? []).length === 0).length;
  const analyzedAwaitingApproval = reviewCount - unanalyzedCount;
  const totalAnalyses = entities.reduce((sum, entity) => sum + (entity.ai_analyses ?? []).length, 0);
  const lastAnalysisAt = analysesResult.data?.[0]?.generated_at ?? null;

  const latestRunBySource = new Map<string, CollectorRun>();
  for (const run of (runsResult.data ?? []) as CollectorRun[]) {
    if (!latestRunBySource.has(run.source_id)) latestRunBySource.set(run.source_id, run);
  }

  const kpis = [
    { label: "공개 서비스", value: publicCount, icon: Database, tone: "cyan" as const, delta: `AI 분석 누적 ${totalAnalyses}건` },
    { label: "검토 대기", value: reviewCount, icon: Layers, tone: "violet" as const, delta: `승인 대기 ${analyzedAwaitingApproval}건` },
    { label: "AI 분석 대기", value: unanalyzedCount, icon: Clock, tone: "orange" as const, delta: unanalyzedCount ? "3시간마다 순차 분석" : "대기 후보 없음" },
    { label: "최근 AI 분석", value: relativeFromNow(lastAnalysisAt) ?? "없음", icon: Gauge, tone: "blue" as const, delta: formatKst(lastAnalysisAt) },
  ];

  const channels = INGESTED_SOURCES.map((code) => {
    const source = (sourcesResult.data ?? []).find((row) => row.code === code);
    const run = source ? latestRunBySource.get(source.id) : undefined;
    return { code, source, run };
  });

  return (
    <div className="page admin-page">
      <section className="page-heading">
        <div>
          <h1>운영 현황</h1>
          <p>수집 채널 상태와 AI 분석 대기열을 확인하세요. 시간은 한국 시간 기준입니다.</p>
        </div>
      </section>

      <section className="kpi-grid" aria-label="운영 핵심 지표">
        {kpis.map(({ label, value, delta, icon: Icon, tone }) => (
          <article className="kpi-card" key={label}>
            <div className={`kpi-icon tone-${tone}`}><Icon size={19} /></div>
            <span>{label}</span>
            <div><strong>{value}</strong><em>{delta}</em></div>
          </article>
        ))}
      </section>

      <section className="ops-section" aria-label="수집 채널 상태">
        <h2 className="ops-heading">수집 채널</h2>
        <div className="ops-channels">
          {channels.map(({ code, source, run }) => {
            const warning = firstWarning(run?.error_log_json);
            const statusKey = run?.status ?? "none";
            const statusLabel = run ? RUN_STATUS_LABEL[run.status] ?? run.status : "미실행";
            return (
              <article className="ops-channel" key={code}>
                <SourceBrandIcon source={code} size="medium" />
                <div className="ops-channel-meta">
                  <strong>{getSourceLabel(code)}</strong>
                  <small>
                    <span className={`ops-status ops-status-${statusKey}`}>{statusLabel}</span>
                    {" · 마지막 수집 "}
                    {formatKst(source?.last_collected_at)}
                    {source?.enabled === false && " · 비활성"}
                  </small>
                  {warning && <small className="ops-channel-warning"><AlertTriangle size={13} aria-hidden="true" />{warning}</small>}
                </div>
                <div className="ops-channel-stats">
                  <div><span>수집</span><b>{run?.fetched_count ?? "—"}</b></div>
                  <div><span>신규</span><b>{run?.inserted_count ?? "—"}</b></div>
                  <div><span>오류</span><b>{run?.error_count ?? "—"}</b></div>
                  <div><span>남은 호출</span><b>{run?.rate_limit_remaining ?? "—"}</b></div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="ops-section" aria-label="AI 분석 대기열">
        <h2 className="ops-heading">AI 분석 대기열</h2>
        <div className="ops-note">
          {unanalyzedCount > 0 ? (
            <p><CheckCircle2 size={15} aria-hidden="true" />미분석 후보 <strong>{unanalyzedCount}건</strong>이 대기 중입니다. 3시간마다 실행당 최대 50건을 순차 분석하며, Gemini 무료 한도 도달 시 중단 후 다음 주기에 이어서 처리합니다.</p>
          ) : (
            <p><CheckCircle2 size={15} aria-hidden="true" />현재 미분석 후보가 없습니다. 다음 수집 주기에 새 후보가 확보되면 자동으로 분석·공개됩니다.</p>
          )}
          <p className="ops-note-sub">공개 서비스 {publicCount}건 · 검토 대기 {reviewCount}건(그중 승인 대기 {analyzedAwaitingApproval}건) · 최근 분석 {formatKst(lastAnalysisAt)}</p>
        </div>
      </section>
    </div>
  );
}
