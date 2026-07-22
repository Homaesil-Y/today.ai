import { loadWorkspaceEnvironment } from "@ai-trend-radar/collectors";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const env = loadWorkspaceEnvironment();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !secretKey) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required");

const TOP_N = 10;
const timeZone = env.APP_TIMEZONE ?? "Asia/Seoul";

const client = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });

const rowSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  categories: z.object({ name: z.string() }).nullable(),
  trend_scores: z.array(z.object({
    total_score: z.coerce.number(),
    trust_score: z.coerce.number(),
    status: z.string(),
    calculated_at: z.string(),
  })).default([]),
  ai_analyses: z.array(z.object({ summary: z.string(), generated_at: z.string() })).default([]),
});

const { data, error } = await client
  .from("entities")
  .select("id,slug,name,categories(name),trend_scores(total_score,trust_score,status,calculated_at),ai_analyses(summary,generated_at)")
  .eq("visibility", "public");
if (error) throw new Error(`공개 엔티티 조회 실패: ${error.message}`);

const rows = z.array(rowSchema).parse(data ?? []);
const ranked = rows
  .map((row) => {
    const score = [...row.trend_scores].sort((a, b) => b.calculated_at.localeCompare(a.calculated_at))[0];
    const analysis = [...row.ai_analyses].sort((a, b) => b.generated_at.localeCompare(a.generated_at))[0];
    return {
      slug: row.slug,
      name: row.name,
      category: row.categories?.name ?? "기타",
      trendScore: Number(score?.total_score ?? 0),
      trustScore: Number(score?.trust_score ?? 0),
      status: score?.status ?? "WATCH",
      summary: analysis?.summary ?? null,
    };
  })
  .sort((a, b) => b.trendScore - a.trendScore || b.trustScore - a.trustScore)
  .slice(0, TOP_N)
  .map((item, index) => ({ rank: index + 1, ...item }));

const now = new Date();
const reportDate = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
const totalPublic = rows.length;

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

process.stdout.write(`${JSON.stringify({ reportDate, totalPublic, topCount: ranked.length, status: "published" }, null, 2)}\n`);
