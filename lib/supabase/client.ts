import { createBrowserClient } from "@supabase/ssr";

import { getPublicEnv } from "@/lib/env";

const FALLBACK_SUPABASE_URL = "https://invalid.localhost";
const FALLBACK_SUPABASE_ANON_KEY = "invalid-anon-key";

export function createClient() {
  const env = getPublicEnv();
  if (!env.ok) {
    return createBrowserClient(FALLBACK_SUPABASE_URL, FALLBACK_SUPABASE_ANON_KEY);
  }

  return createBrowserClient(env.data.NEXT_PUBLIC_SUPABASE_URL, env.data.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
