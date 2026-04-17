import "server-only";

import { createClient } from "@supabase/supabase-js";

import { getServerEnv } from "@/lib/env";

export function getSupabaseAdmin() {
  const env = getServerEnv();
  if (!env.ok) return env;

  return {
    ok: true as const,
    data: createClient(env.data.NEXT_PUBLIC_SUPABASE_URL, env.data.SUPABASE_SERVICE_ROLE_KEY),
  };
}
