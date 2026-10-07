import { loadWorkspaceEnvironment, meteredClientOptions } from "@ai-trend-radar/collectors";
import { createClient } from "@supabase/supabase-js";
import { loadDailyReportTop } from "../daily-report";

const env = loadWorkspaceEnvironment();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !secretKey) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required");

const TOP_N = 10;
const timeZone = env.APP_TIMEZONE ?? "Asia/Seoul";

const client = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false }, ...meteredClientOptions("report") });

// 가장 최근 채점일의 상위 N건만 읽는다(이력 전체를 읽던 방식의 문제는 daily-report.ts 참고).
const { totalPublic, scoreDate, topServices: ranked } = await loadDailyReportTop(client, TOP_N);

const now = new Date();
const reportDate = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);

const contentJson = {
  generatedAt: now.toISOString(),
  timezone: timeZone,
  totalPublic,
  topServices: ranked,
};

const title = `${reportDate} 오늘의 AI 트렌드 리포트`;
const summary = totalPublic > 0
  ? `공개된 AI 서비스 ${totalPublic}개 중 트렌드 점수 상위 ${ranked.length}개를 정리했습니다.`
  : "아직 공개된 AI 서비스가 없습니다.";

const { error: upsertError } = await client.from("reports").upsert({
  report_type: "daily",
  report_date: reportDate,
  title,
  summary,
  content_json: contentJson,
  status: "published",
  generated_at: now.toISOString(),
  published_at: now.toISOString(),
}, { onConflict: "report_type,report_date" });
if (upsertError) throw new Error(`리포트 저장 실패: ${upsertError.message}`);

process.stdout.write(`${JSON.stringify({ reportDate, scoreDate, totalPublic, topCount: ranked.length, status: "published" }, null, 2)}\n`);
