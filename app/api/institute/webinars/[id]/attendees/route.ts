import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

async function getInstituteId(userId: string) {
  const supabase = await createClient();
  const admin = getSupabaseAdmin();
  const dataClient = admin.ok ? admin.data : supabase;
  const { data } = await dataClient.from("institutes").select("id").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle<{ id: string }>();
  return data?.id ?? null;
}

function normalize(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser("institute", { requireApproved: false });
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const instituteId = await getInstituteId(auth.user.id);
  if (!instituteId) return NextResponse.json({ error: "Institute profile not found" }, { status: 404 });

  const admin = getSupabaseAdmin();
  const supabase = await createClient();
  const dataClient = admin.ok ? admin.data : supabase;

  const { data: webinar } = await dataClient.from("webinars").select("id").eq("id", id).eq("institute_id", instituteId).maybeSingle();
  if (!webinar) return NextResponse.json({ error: "Webinar not found" }, { status: 404 });

  const { data, error } = await dataClient
    .from("webinar_registrations")
    .select("id,webinar_order_id,student_id,registration_status,payment_status,access_status,attended_at,joined_at,left_at,registered_at,created_at,profiles(full_name,email,phone)")
    .eq("webinar_id", id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data ?? [];
  const orderIds = [...new Set(rows.map((row) => row.webinar_order_id).filter((value): value is string => Boolean(value)))];
  const [{ data: orders }, { data: refunds }] = await Promise.all([
    orderIds.length ? dataClient.from("webinar_orders").select("id,payment_status,order_status,access_status").in("id", orderIds) : Promise.resolve({ data: [] }),
    orderIds.length ? dataClient.from("refunds").select("webinar_order_id,refund_status").in("webinar_order_id", orderIds) : Promise.resolve({ data: [] }),
  ]);

  const orderById = new Map((orders ?? []).map((order) => [order.id, order]));
  const refundByOrderId = new Map((refunds ?? []).map((refund) => [refund.webinar_order_id, refund.refund_status]));

  const attendees = rows.map((row) => {
    const order = row.webinar_order_id ? orderById.get(row.webinar_order_id) ?? null : null;
    const refundStatus = row.webinar_order_id ? refundByOrderId.get(row.webinar_order_id) ?? null : null;
    const refundedOrRevoked =
      normalize(row.payment_status) === "refunded" ||
      normalize(row.access_status) === "revoked" ||
      normalize(row.registration_status) === "cancelled" ||
      normalize(order?.payment_status) === "refunded" ||
      normalize(order?.order_status) === "refunded" ||
      normalize(order?.access_status) === "revoked" ||
      normalize(refundStatus) === "refunded";

    return {
      ...row,
      webinar_order: order,
      refund_status: refundStatus,
      refunded_or_revoked: refundedOrRevoked,
      eligible: normalize(row.registration_status) === "registered" && normalize(row.access_status) === "granted" && !refundedOrRevoked,
      attendance_activity: Boolean(row.joined_at || row.attended_at),
    };
  });

  return NextResponse.json({ attendees });
}
