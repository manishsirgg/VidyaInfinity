import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const errors: string[] = [];

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) errors.push(`auth:${authError.message}`);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id,role")
    .eq("id", user.id)
    .maybeSingle<{ id: string; role: string | null }>();

  if (profileError) errors.push(`profile:${profileError.message}`);

  const profileId = profile?.id ?? null;

  const { data: orders, error: ordersError } = profileId
    ? await supabase
        .from("psychometric_orders")
        .select("id,attempt_id,created_at")
        .eq("user_id", profileId)
        .order("created_at", { ascending: false })
    : { data: [], error: null };

  if (ordersError) errors.push(`orders:${ordersError.message}`);

  const orderIds = (orders ?? []).map((order) => order.id);
  const attemptIds = (orders ?? []).map((order) => order.attempt_id).filter((value): value is string => Boolean(value));

  const { data: attemptsByOrder, error: attemptsByOrderError } = orderIds.length
    ? await supabase.from("test_attempts").select("id,status,created_at,order_id").in("order_id", orderIds).order("created_at", { ascending: false })
    : { data: [], error: null };

  const { data: attemptsById, error: attemptsByIdError } = attemptIds.length
    ? await supabase.from("test_attempts").select("id,status,created_at,order_id").in("id", attemptIds).order("created_at", { ascending: false })
    : { data: [], error: null };

  if (attemptsByOrderError) errors.push(`attempts_by_order:${attemptsByOrderError.message}`);
  if (attemptsByIdError) errors.push(`attempts_by_id:${attemptsByIdError.message}`);

  const attempts = Array.from(new Map([...(attemptsByOrder ?? []), ...(attemptsById ?? [])].map((attempt) => [attempt.id, attempt])).values());

  const { data: reports, error: reportsError } = attempts.length
    ? await supabase.from("psychometric_reports").select("id,attempt_id,created_at").in("attempt_id", attempts.map((attempt) => attempt.id)).order("created_at", { ascending: false })
    : { data: [], error: null };

  if (reportsError) errors.push(`reports:${reportsError.message}`);

  return NextResponse.json({
    authUserId: user.id,
    profileId,
    profileRole: profile?.role ?? null,
    ordersCount: orders?.length ?? 0,
    latestOrderId: orders?.[0]?.id ?? null,
    latestOrderAttemptId: orders?.[0]?.attempt_id ?? null,
    attemptsCount: attempts.length,
    latestAttemptId: attempts?.[0]?.id ?? null,
    latestAttemptStatus: attempts?.[0]?.status ?? null,
    reportsCount: reports?.length ?? 0,
    errors,
  });
}
