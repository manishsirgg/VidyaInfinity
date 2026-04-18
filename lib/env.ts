export type EnvResult<T> = { ok: true; data: T } | { ok: false; error: string };

type ServerEnv = {
  NEXT_PUBLIC_SUPABASE_URL: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  RAZORPAY_KEY_ID: string;
  RAZORPAY_KEY_SECRET: string;
  RAZORPAY_WEBHOOK_SECRET?: string;
};

type PublicEnv = {
  NEXT_PUBLIC_SUPABASE_URL: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY: string;
  NEXT_PUBLIC_RAZORPAY_KEY_ID?: string;
};

function missing(keys: string[]) {
  return `Missing required environment variables: ${keys.join(", ")}`;
}

export function getPublicEnv(): EnvResult<PublicEnv> {
  const values = {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_RAZORPAY_KEY_ID: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
  };

  const missingKeys = Object.entries(values)
     .filter(([key, value]) => key !== "NEXT_PUBLIC_RAZORPAY_KEY_ID" && !value)
    .map(([key]) => key);

  if (missingKeys.length) return { ok: false, error: missing(missingKeys) };

  return { ok: true, data: values as PublicEnv };
}

export function getServerEnv(): EnvResult<ServerEnv> {
  const publicEnv = getPublicEnv();
  if (!publicEnv.ok) return publicEnv;

  const serverValues = {
    ...publicEnv.data,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID,
    RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET,
    RAZORPAY_WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET,
  };

  const missingKeys = Object.entries(serverValues)
    .filter(([key, value]) => key !== "RAZORPAY_WEBHOOK_SECRET" && !value)
    .map(([key]) => key);

  if (missingKeys.length) return { ok: false, error: missing(missingKeys) };

  return { ok: true, data: serverValues as ServerEnv };
}
