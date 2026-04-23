import { notFound } from "next/navigation";

import { StatusBadge } from "@/components/shared/status-badge";
import { requireUser } from "@/lib/auth/get-session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { toDateTimeLabel } from "@/lib/webinars/utils";

type ProfileJoin = { full_name?: string | null; email?: string | null; phone?: string | null };

type AttendeeRegistrationRow = {
  id: string;
  webinar_order_id: string | null;
  student_id: string;
  registration_status: string;
  payment_status: string;
  access_status: string;
  registered_at: string | null;
  created_at: string;
  profiles: ProfileJoin | ProfileJoin[] | null;
};

type WebinarRefundRow = {
  webinar_order_id: string | null;
  refund_status: string;
};

function profileField(value: unknown, key: keyof ProfileJoin) {
  if (Array.isArray(value)) return (value[0]?.[key] ?? null) as string | null;
  return ((value as ProfileJoin | null)?.[key] ?? null) as string | null;
}

function paymentBadgeLabel(paymentStatus: string) {
  return paymentStatus === "paid" ? "Paid" : paymentStatus === "not_required" ? "Free" : paymentStatus;
}

function accessBadgeLabel(accessStatus: string) {
  return accessStatus === "granted" ? "Access Granted" : accessStatus === "locked" ? "Pending" : accessStatus;
}

export default async function WebinarAttendeesPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireUser("institute", { requireApproved: false });
  const { id } = await params;
  const supabase = await createClient();
  const admin = getSupabaseAdmin();
  const dataClient = admin.ok ? admin.data : supabase;

  const { data: institute } = await dataClient
    .from("institutes")
    .select("id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string }>();
  if (!institute) notFound();

  const { data: webinar } = await dataClient
    .from("webinars")
    .select("id,title")
    .eq("id", id)
    .eq("institute_id", institute.id)
    .maybeSingle<{ id: string; title: string }>();
  if (!webinar) notFound();

  console.info("[institute/webinars/attendees] attendees_query_executed", {
    event: "attendees_query_executed",
    webinar_id: id,
    institute_id: institute.id,
    source: "webinar_registrations",
  });

  const attendeesQuery = dataClient
    .from("webinar_registrations")
    .select("id,webinar_order_id,student_id,registration_status,payment_status,access_status,registered_at,created_at,profiles(full_name,email,phone)")
    .eq("webinar_id", id)
    .order("registered_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  const { data: attendees, error: attendeesError } = await attendeesQuery;

  if (attendeesError) {
    console.error("[institute/webinars/attendees] attendees_empty_reason", {
      event: "attendees_empty_reason",
      webinar_id: id,
      reason: "query_error",
      error: attendeesError.message,
      code: attendeesError.code ?? null,
    });
  }

  const rows = (attendees ?? []) as AttendeeRegistrationRow[];
  const webinarOrderIds = [...new Set(rows.map((row) => row.webinar_order_id).filter((value): value is string => Boolean(value)))];

  let refundByOrderId = new Map<string, string>();
  if (webinarOrderIds.length > 0) {
    const { data: refunds } = await dataClient
      .from("refunds")
      .select("webinar_order_id,refund_status")
      .in("webinar_order_id", webinarOrderIds)
      .eq("refund_status", "refunded");

    refundByOrderId = new Map(
      ((refunds ?? []) as WebinarRefundRow[])
        .filter((refund) => Boolean(refund.webinar_order_id))
        .map((refund) => [refund.webinar_order_id as string, refund.refund_status]),
    );
  }

  console.info("[institute/webinars/attendees] attendees_count_returned", {
    event: "attendees_count_returned",
    webinar_id: id,
    count: rows.length,
  });

  if (rows.length === 0) {
    console.info("[institute/webinars/attendees] attendees_empty_reason", {
      event: "attendees_empty_reason",
      webinar_id: id,
      reason: attendeesError ? "query_error" : "no_rows",
      source: "webinar_registrations",
    });
  }

  const attendeeRows = rows.map((row) => ({
    ...row,
    displayName: profileField(row.profiles, "full_name") ?? profileField(row.profiles, "email") ?? "Student",
    email: profileField(row.profiles, "email") ?? "-",
    phone: profileField(row.profiles, "phone") ?? "-",
    registeredAt: toDateTimeLabel(row.registered_at ?? row.created_at),
    refundStatus: row.webinar_order_id ? refundByOrderId.get(row.webinar_order_id) ?? null : null,
  }));

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Attendees · {webinar.title}</h1>
      <div className="mt-4 space-y-2">
        {attendeeRows.map((row) => (
          <article key={row.id} className="rounded border bg-white p-3 text-sm">
            <p className="font-medium">{row.displayName}</p>
            <p className="text-slate-600">Email: {row.email}</p>
            <p className="text-slate-600">Phone: {row.phone}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <StatusBadge status={row.payment_status} label={paymentBadgeLabel(row.payment_status)} />
              <StatusBadge status={row.access_status} label={accessBadgeLabel(row.access_status)} />
              {row.refundStatus ? <StatusBadge status={row.refundStatus} label="Refunded" /> : null}
            </div>
            <p className="mt-1 text-xs text-slate-500">Registered: {row.registeredAt}</p>
          </article>
        ))}
        {attendeeRows.length === 0 ? <p className="rounded border border-dashed bg-white p-8 text-center text-slate-600">No attendees yet.</p> : null}
      </div>
    </div>
  );
}
