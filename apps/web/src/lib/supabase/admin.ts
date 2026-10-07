import "server-only";

import { createClient } from "@supabase/supabase-js";
import { getSupabasePublicEnv } from "./env";

/** fetch 를 넘기면 그걸로 요청한다 — 전송량 계량(lib/egress-meter.ts)에 쓴다. */
export function createAdminClient(options: { fetch?: typeof fetch } = {}) {
  const { url } = getSupabasePublicEnv();
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) throw new Error("SUPABASE_SECRET_KEY is required for admin operations");

  return createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    ...(options.fetch ? { global: { fetch: options.fetch } } : {}),
  });
}
