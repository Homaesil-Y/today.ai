import { loadWorkspaceEnvironment, withRetry } from "@ai-trend-radar/collectors";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const env = loadWorkspaceEnvironment();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !secretKey) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required");

const resendApiKey = env.RESEND_API_KEY;
const emailFrom = env.EMAIL_FROM;
const appUrl = (env.NEXT_PUBLIC_APP_URL ?? "https://oh-ai-news.vercel.app").replace(/\/$/, "");
const timeZone = env.APP_TIMEZONE ?? "Asia/Seoul";

const client = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });

const now = new Date();
const reportDate = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);

// 발송 자격증명이 없으면 실패가 아니라 blocked로 안전하게 종료한다.
if (!resendApiKey || !emailFrom) {
  process.stdout.write(`${JSON.stringify({ status: "blocked", reason: "RESEND_API_KEY 또는 EMAIL_FROM 미설정", reportDate, sent: 0 }, null, 2)}\n`);
  process.exit(0);
}

const contentSchema = z.object({
  topServices: z.array(z.object({
    rank: z.number(),
    slug: z.string(),
    name: z.string(),
    category: z.string().default("기타"),
    trendScore: z.coerce.number().default(0),
    summary: z.string().nullable().default(null),
  })).default([]),
});

const { data: report, error: reportError } = await client
  .from("reports")
  .select("title, summary, report_date, content_json")
  .eq("report_type", "daily")
  .eq("report_date", reportDate)
  .eq("status", "published")
  .maybeSingle();
if (reportError) throw new Error(`리포트 조회 실패: ${reportError.message}`);
if (!report) {
  process.stdout.write(`${JSON.stringify({ status: "skipped", reason: "오늘 발행된 리포트 없음", reportDate, sent: 0 }, null, 2)}\n`);
  process.exit(0);
}

const activeReport = report;
const content = contentSchema.catch({ topServices: [] }).parse(activeReport.content_json);

const { data: prefRows, error: prefError } = await client
  .from("user_preferences")
  .select("user_id")
  .eq("daily_digest_enabled", true);
if (prefError) throw new Error(`구독 설정 조회 실패: ${prefError.message}`);
const subscriberIds = z.array(z.object({ user_id: z.string() })).parse(prefRows ?? []).map((row) => row.user_id);

const subscribers: Array<{ userId: string; email: string }> = [];
if (subscriberIds.length > 0) {
  const { data: profileRows, error: profileError } = await client
    .from("user_profiles")
    .select("id, email")
    .in("id", subscriberIds);
  if (profileError) throw new Error(`구독자 이메일 조회 실패: ${profileError.message}`);
  for (const row of z.array(z.object({ id: z.string(), email: z.string() })).parse(profileRows ?? [])) {
    subscribers.push({ userId: row.id, email: row.email });
  }
}

// 오늘 이미 발송한 사용자는 건너뛴다(중복 방지).
const startOfDay = new Date(`${reportDate}T00:00:00+09:00`).toISOString();
const { data: alreadySent } = await client
  .from("notifications")
  .select("user_id")
  .eq("type", "daily_report")
  .eq("status", "sent")
  .gte("sent_at", startOfDay);
const sentUserIds = new Set((alreadySent ?? []).map((row) => row.user_id));

const resendResponseSchema = z.object({ id: z.string() });

function buildHtml(email: string) {
  const rows = content.topServices.slice(0, 10).map((service) => `
    <tr>
      <td style="padding:8px 0;color:#667085;font-variant-numeric:tabular-nums;width:32px;">${String(service.rank).padStart(2, "0")}</td>
      <td style="padding:8px 0;">
        <a href="${appUrl}/services/${service.slug}" style="color:#111;font-weight:700;text-decoration:none;">${escapeHtml(service.name)}</a>
        <span style="color:#667085;font-size:13px;"> · ${escapeHtml(service.category)}</span>
        ${service.summary ? `<div style="color:#475467;font-size:13px;margin-top:2px;">${escapeHtml(service.summary)}</div>` : ""}
      </td>
      <td style="padding:8px 0;text-align:right;font-weight:700;font-variant-numeric:tabular-nums;">${service.trendScore.toFixed(1)}</td>
    </tr>`).join("");
  return `<!doctype html><html lang="ko"><body style="margin:0;background:#f5f6f8;padding:24px;font-family:-apple-system,'Segoe UI',sans-serif;">
    <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:14px;padding:28px;">
      <p style="margin:0 0 4px;color:#6d5dfb;font-weight:700;">오늘의 AI</p>
      <h1 style="margin:0 0 6px;font-size:20px;">${escapeHtml(activeReport.title)}</h1>
      <p style="margin:0 0 18px;color:#667085;font-size:14px;">${escapeHtml(activeReport.summary ?? "")}</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">${rows}</table>
      <a href="${appUrl}/reports/${reportDate}" style="display:inline-block;margin-top:20px;padding:10px 16px;background:#6d5dfb;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">전체 리포트 보기</a>
      <p style="margin:22px 0 0;color:#98a2b3;font-size:12px;">이 메일은 오늘의 AI 알림 설정에서 수신 동의하신 분께 발송됩니다. 설정에서 언제든 변경할 수 있습니다.</p>
    </div></body></html>`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch] ?? ch));
}

let sent = 0;
let skipped = 0;
const errors: string[] = [];
for (const subscriber of subscribers) {
  if (sentUserIds.has(subscriber.userId)) { skipped += 1; continue; }
  try {
    await withRetry(async () => {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: emailFrom, to: [subscriber.email], subject: activeReport.title, html: buildHtml(subscriber.email) }),
      });
      if (response.status === 429 || response.status >= 500) throw new Error(`Resend HTTP ${response.status}`);
      if (!response.ok) throw new Error(`Resend HTTP ${response.status}: ${await response.text()}`);
      resendResponseSchema.parse(await response.json());
    });
    await client.from("notifications").insert({
      user_id: subscriber.userId,
      type: "daily_report",
      title: activeReport.title,
      body: activeReport.summary ?? "",
      channel: "email",
      status: "sent",
      sent_at: new Date().toISOString(),
    });
    sent += 1;
  } catch (error) {
    errors.push(`${subscriber.userId}: ${error instanceof Error ? error.message : "unknown"}`);
  }
}

process.stdout.write(`${JSON.stringify({ status: "sent", reportDate, subscribers: subscribers.length, sent, skipped, errors }, null, 2)}\n`);
if (errors.length && sent === 0) process.exitCode = 1;
