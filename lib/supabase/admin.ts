import "server-only";

import { createClient } from "@supabase/supabase-js";

import { getServerEnv } from "@/lib/env";

const SERVER_CONFIG_ERROR = "Server configuration is unavailable. Please contact support.";

export function getSupabaseAdmin() {
  const env = getServerEnv();
  if (!env.ok) {
    console.error("[supabase/admin] configuration error", { error: env.error });
    return { ok: false as const, error: SERVER_CONFIG_ERROR };
  }

  return {
    ok: true as const,
    data: createClient(env.data.NEXT_PUBLIC_SUPABASE_URL, env.data.SUPABASE_SERVICE_ROLE_KEY),
  };
}
