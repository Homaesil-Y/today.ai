import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { DAILY_EGRESS_BUDGET_BYTES, formatBytes } from "@ai-trend-radar/types/egress";
import type { EgressSummary } from "./egress-summary";

/**
 * /admin/ops 의 Supabase 전송량 카드. 2026-10-06 egress 한도 초과로 프로젝트가 차단될 때까지 사용량을
 * 볼 곳이 없었다 — 여기서 이번 결제 주기 사용량·주기 말 예상·일별 막대·많이 쓴 곳을 보여준다.
 */
export function EgressCard({ egress }: { egress: EgressSummary }) {
  return (
    <section className="ops-section" aria-label="Supabase 전송량">
      <h2 className="ops-heading">Supabase 전송량 <span className="ops-heading-note">추정치</span></h2>
      <div className="ops-note">
        {egress.state === "missing" && (
          <p className="ops-egress-warn">
            <AlertTriangle size={15} aria-hidden="true" />
            계량 테이블이 아직 없습니다. Supabase SQL Editor 에서 supabase/migrations/202610070001_egress_meter.sql 을 실행하면 다음 실행부터 기록됩니다.
          </p>
        )}
        {egress.state === "error" && (
          <p className="ops-egress-warn"><AlertTriangle size={15} aria-hidden="true" />전송량 기록을 읽지 못했습니다: {egress.message}</p>
        )}
        {egress.state === "ready" && (() => {
          const { budget, days, scaleBytes, yesterdaySources, todaySources } = egress;
          const percent = (share: number) => `${Math.round(share * 100)}%`;
          const levelText = {
            ok: "한도 안에서 쓰고 있습니다.",
            warn: "한도에 가까워지고 있습니다.",
            alert: "이 속도면 주기 안에 한도를 넘습니다. 아래 많이 쓴 곳부터 줄이세요.",
          }[budget.level];
          const sources = (list: typeof yesterdaySources) => (list.length > 0
            ? list.map(({ source, bytes }) => `${source} ${formatBytes(bytes)}`).join(" · ")
            : "기록 없음");
          return (
            <>
              <p className={`ops-egress-${budget.level}`}>
                {budget.level === "ok" ? <CheckCircle2 size={15} aria-hidden="true" /> : <AlertTriangle size={15} aria-hidden="true" />}
                <span>
                  이번 주기 <strong>{formatBytes(budget.usedBytes)}</strong> / {formatBytes(budget.quotaBytes)} ({percent(budget.usedShare)})
                  {" · "}주기 말 예상 <strong>{formatBytes(budget.projectedBytes)}</strong> ({percent(budget.projectedShare)})
                  {" · "}최근 하루 평균 {formatBytes(budget.recentDailyBytes)}. {levelText}
                </span>
              </p>
              {budget.reasons.length > 0 && <p className="ops-note-sub">{budget.reasons.join(" · ")}</p>}
              <div
                className="ops-egress-gauge"
                role="img"
                aria-label={`한도 대비 사용 ${percent(budget.usedShare)}, 주기 말 예상 ${percent(budget.projectedShare)}`}
              >
                <span className={`ops-egress-fill-${budget.level}`} style={{ width: `${Math.min(100, budget.usedShare * 100)}%` }} />
                <i style={{ left: `${Math.min(100, budget.projectedShare * 100)}%` }} title={`주기 말 예상 ${formatBytes(budget.projectedBytes)}`} />
              </div>
              <div className="ops-egress-days" role="img" aria-label="결제 주기 일별 전송량">
                <b className="ops-egress-budget-line" style={{ bottom: `${(DAILY_EGRESS_BUDGET_BYTES / scaleBytes) * 100}%` }} />
                {days.map((bar) => (
                  <span
                    key={bar.day}
                    className={[
                      bar.bytes > DAILY_EGRESS_BUDGET_BYTES ? "over" : "",
                      bar.isToday ? "today" : "",
                      bar.metered ? "" : "unmetered",
                    ].filter(Boolean).join(" ") || undefined}
                    style={{ height: `${bar.metered ? Math.max(2, (bar.bytes / scaleBytes) * 100) : 0}%` }}
                    title={`${bar.day.slice(5).replace("-", "/")} ${bar.metered ? formatBytes(bar.bytes) : "계량 전"}${bar.isToday ? " (진행 중)" : ""}`}
                  />
                ))}
              </div>
              <div className="ops-egress-legend">
                <span>{budget.cycleStart.slice(5).replace("-", "/")} 주기 시작</span>
                <span>점선 = 하루 예산 {formatBytes(DAILY_EGRESS_BUDGET_BYTES)}</span>
                <span>{budget.nextCycleStart.slice(5).replace("-", "/")} 초기화</span>
              </div>
              <p className="ops-note-sub">어제 많이 쓴 곳: {sources(yesterdaySources)}</p>
              <p className="ops-note-sub">오늘(UTC): {sources(todaySources)}</p>
              <p className="ops-note-sub">
                우리 코드가 Supabase 에서 받은 응답 크기를 잰 추정치(±20%)입니다. 대시보드 접속·로그인 등은 빠져 있어
                정확한 값은 Supabase 대시보드 Organization → Usage 가 기준입니다.
                {!budget.coversWholeCycle && ` ${budget.firstMeteredDay ?? "오늘"} 이전 사용량은 계량 전이라 합계에 없습니다.`}
              </p>
            </>
          );
        })()}
      </div>
    </section>
  );
}
