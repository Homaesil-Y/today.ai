import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { getSupabasePublicEnv } from "./env";

export async function createClient() {
  const cookieStore = await cookies();
  const { url, publishableKey } = getSupabasePublicEnv();

  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Server Components cannot write cookies. proxy.ts refreshes them.
        }
      },
    },
  });
}

/** fetch 를 넘기면 그걸로 요청한다 — 전송량 계량(lib/egress-meter.ts)에 쓴다. */
export function createPublicClient(options: { fetch?: typeof fetch } = {}) {
  const { url, publishableKey } = getSupabasePublicEnv();
  return createSupabaseClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    ...(options.fetch ? { global: { fetch: options.fetch } } : {}),
  });
}
