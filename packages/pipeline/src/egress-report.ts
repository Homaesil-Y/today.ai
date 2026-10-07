import { z } from "zod";

/**
 * 워크플로 한 번이 쓴 Supabase 전송량 집계(egress-meter 파일 → 날짜·출처별 합계).
 * 파일 형식은 collectors 의 writeEgressTallies 가 남기는 JSON 한 줄씩이다.
 */
const meterLineSchema = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  label: z.string().min(1).max(60),
  requests: z.number().int().nonnegative(),
  bytes: z.number().nonnegative(),
});

export type MeterEntry = z.infer<typeof meterLineSchema>;

export function parseMeterLines(text: string): MeterEntry[] {
  const merged = new Map<string, MeterEntry>();
  for (const line of text.split(/\r?\n/u)) {
    if (!line.trim()) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue; // 잘린 줄(프로세스가 쓰다 죽은 경우)은 건너뛴다.
    }
    const entry = meterLineSchema.safeParse(parsed);
    if (!entry.success) continue;
    const key = `${entry.data.day}|${entry.data.label}`;
    const current = merged.get(key);
    if (current) {
      current.requests += entry.data.requests;
      current.bytes += entry.data.bytes;
    } else {
      merged.set(key, { ...entry.data });
    }
  }
  return [...merged.values()].sort((a, b) => a.day.localeCompare(b.day) || a.label.localeCompare(b.label));
}

/** 계량 테이블·함수가 아직 없을 때(마이그레이션 미적용)의 오류인지. */
export function isMissingMeterObject(error: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "42883" || error.code === "PGRST202" || error.code === "PGRST205") return true;
  return /egress_meter_daily|record_egress/u.test(error.message ?? "") && /does not exist|could not find/iu.test(error.message ?? "");
}
