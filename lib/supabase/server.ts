import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getPublicEnv } from "@/lib/env";

const FALLBACK_SUPABASE_URL = "https://invalid.localhost";
const FALLBACK_SUPABASE_ANON_KEY = "invalid-anon-key";

type CookieToSet = {
  name: string;
  value: string;
  options?: Parameters<Awaited<ReturnType<typeof cookies>>["set"]>[2];
};

export async function createClient() {
  const env = getPublicEnv();
  const cookieStore = await cookies();

  return createServerClient(
    env.ok ? env.data.NEXT_PUBLIC_SUPABASE_URL : FALLBACK_SUPABASE_URL,
    env.ok ? env.data.NEXT_PUBLIC_SUPABASE_ANON_KEY : FALLBACK_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        },
      },
    }
  );
}
