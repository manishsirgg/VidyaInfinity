import Link from "next/link";
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
  joined_at: string | null;
  attended_at: string | null;
  created_at: string;
  profiles: ProfileJoin | ProfileJoin[] | null;
};

type WebinarOrderRow = {
  id: string;
  payment_status: string | null;
  order_status: string | null;
  access_status: string | null;
};

type WebinarRefundRow = {
  webinar_order_id: string | null;
  refund_status: string;
};

type AttendeeTab = "all" | "eligible" | "refunded" | "attendance";

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

function normalize(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

function isRefundedOrRevoked(input: {
  registrationStatus: string;
  paymentStatus: string;
  accessStatus: string;
  orderPaymentStatus: string | null;
  orderStatus: string | null;
  orderAccessStatus: string | null;
  refundStatus: string | null;
}) {
  return (
    normalize(input.paymentStatus) === "refunded" ||
    normalize(input.accessStatus) === "revoked" ||
    normalize(input.registrationStatus) === "cancelled" ||
    normalize(input.registrationStatus) === "canceled" ||
    normalize(input.orderPaymentStatus) === "refunded" ||
    normalize(input.orderStatus) === "refunded" ||
    normalize(input.orderAccessStatus) === "revoked" ||
    normalize(input.refundStatus) === "refunded"
  );
}

function tabLink(webinarId: string, activeTab: AttendeeTab, tab: AttendeeTab, label: string, count: number) {
  const active = activeTab === tab;
  return (
    <Link
      key={tab}
      href={`/institute/webinars/${webinarId}/attendees?tab=${tab}`}
      className={`rounded border px-3 py-1.5 text-sm ${active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700"}`}
    >
      {label} ({count})
    </Link>
  );
}

export default async function WebinarAttendeesPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const { user } = await requireUser("institute", { requireApproved: false });
  const { id } = await params;
  const query = (await searchParams) ?? {};
  const rawTab = Array.isArray(query.tab) ? query.tab[0] : query.tab;
  const activeTab: AttendeeTab = rawTab === "eligible" || rawTab === "refunded" || rawTab === "attendance" ? rawTab : "all";

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

  const { data: attendees, error: attendeesError } = await dataClient
    .from("webinar_registrations")
    .select("id,webinar_order_id,student_id,registration_status,payment_status,access_status,registered_at,joined_at,attended_at,created_at,profiles(full_name,email,phone)")
    .eq("webinar_id", id)
    .order("registered_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

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

  const [{ data: orders }, { data: refunds }] = await Promise.all([
    webinarOrderIds.length
      ? dataClient.from("webinar_orders").select("id,payment_status,order_status,access_status").in("id", webinarOrderIds)
      : Promise.resolve({ data: [] as WebinarOrderRow[] }),
    webinarOrderIds.length
      ? dataClient.from("refunds").select("webinar_order_id,refund_status").in("webinar_order_id", webinarOrderIds)
      : Promise.resolve({ data: [] as WebinarRefundRow[] }),
  ]);

  const orderById = new Map(((orders ?? []) as WebinarOrderRow[]).map((order) => [order.id, order]));
  const refundByOrderId = new Map(
    ((refunds ?? []) as WebinarRefundRow[])
      .filter((refund) => Boolean(refund.webinar_order_id))
      .map((refund) => [refund.webinar_order_id as string, refund.refund_status]),
  );

  const attendeeRows = rows.map((row) => {
    const order = row.webinar_order_id ? orderById.get(row.webinar_order_id) ?? null : null;
    const refundStatus = row.webinar_order_id ? refundByOrderId.get(row.webinar_order_id) ?? null : null;
    const refundedOrRevoked = isRefundedOrRevoked({
      registrationStatus: row.registration_status,
      paymentStatus: row.payment_status,
      accessStatus: row.access_status,
      orderPaymentStatus: order?.payment_status ?? null,
      orderStatus: order?.order_status ?? null,
      orderAccessStatus: order?.access_status ?? null,
      refundStatus,
    });

    return {
      ...row,
      displayName: profileField(row.profiles, "full_name") ?? profileField(row.profiles, "email") ?? "Student",
      email: profileField(row.profiles, "email") ?? "-",
      phone: profileField(row.profiles, "phone") ?? "-",
      registeredAt: toDateTimeLabel(row.registered_at ?? row.created_at),
      joinedAt: row.joined_at ? toDateTimeLabel(row.joined_at) : "-",
      attendedAt: row.attended_at ? toDateTimeLabel(row.attended_at) : "-",
      orderPaymentStatus: order?.payment_status ?? "-",
      orderStatus: order?.order_status ?? "-",
      orderAccessStatus: order?.access_status ?? "-",
      refundStatus,
      refundedOrRevoked,
      isEligible: normalize(row.registration_status) === "registered" && normalize(row.access_status) === "granted" && !refundedOrRevoked,
      hasAttendanceActivity: Boolean(row.joined_at || row.attended_at),
      isFree: normalize(row.payment_status) === "not_required",
      isPaid: normalize(row.payment_status) === "paid",
    };
  });

  const eligibleRows = attendeeRows.filter((row) => row.isEligible);
  const refundedRows = attendeeRows.filter((row) => row.refundedOrRevoked);
  const attendanceRows = attendeeRows.filter((row) => row.hasAttendanceActivity);

  for (const row of attendeeRows) {
    const wouldBeEligible = normalize(row.registration_status) === "registered" && normalize(row.access_status) === "granted";
    if (wouldBeEligible && row.refundedOrRevoked) {
      console.info("[institute/webinars/attendees] webinar_refunded_user_excluded_from_eligible_list", {
        event: "webinar_refunded_user_excluded_from_eligible_list",
        webinar_id: id,
        registration_id: row.id,
        student_id: row.student_id,
        webinar_order_id: row.webinar_order_id,
      });
    }
  }

  console.info("[institute/webinars/attendees] institute_webinar_registrations_loaded", {
    event: "institute_webinar_registrations_loaded",
    webinar_id: id,
    institute_id: institute.id,
    count: attendeeRows.length,
  });
  console.info("[institute/webinars/attendees] institute_webinar_eligible_attendees_loaded", {
    event: "institute_webinar_eligible_attendees_loaded",
    webinar_id: id,
    institute_id: institute.id,
    count: eligibleRows.length,
  });
  console.info("[institute/webinars/attendees] institute_webinar_refunded_users_loaded", {
    event: "institute_webinar_refunded_users_loaded",
    webinar_id: id,
    institute_id: institute.id,
    count: refundedRows.length,
  });
  console.info("[institute/webinars/attendees] institute_webinar_attendance_activity_loaded", {
    event: "institute_webinar_attendance_activity_loaded",
    webinar_id: id,
    institute_id: institute.id,
    count: attendanceRows.length,
  });

  const summary = {
    totalRegistrations: attendeeRows.length,
    paidRegistrations: attendeeRows.filter((row) => row.isPaid).length,
    freeRegistrations: attendeeRows.filter((row) => row.isFree).length,
    eligibleAttendees: eligibleRows.length,
    refundedOrRevoked: refundedRows.length,
    joined: attendeeRows.filter((row) => Boolean(row.joined_at)).length,
    attended: attendeeRows.filter((row) => Boolean(row.attended_at)).length,
  };

  const visibleRows = activeTab === "eligible" ? eligibleRows : activeTab === "refunded" ? refundedRows : activeTab === "attendance" ? attendanceRows : attendeeRows;

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Attendees · {webinar.title}</h1>

      <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded border bg-white p-3"><p className="text-slate-500">Total Registrations</p><p className="text-lg font-semibold">{summary.totalRegistrations}</p></div>
        <div className="rounded border bg-white p-3"><p className="text-slate-500">Paid Registrations</p><p className="text-lg font-semibold">{summary.paidRegistrations}</p></div>
        <div className="rounded border bg-white p-3"><p className="text-slate-500">Free Registrations</p><p className="text-lg font-semibold">{summary.freeRegistrations}</p></div>
        <div className="rounded border bg-white p-3"><p className="text-slate-500">Eligible Attendees</p><p className="text-lg font-semibold">{summary.eligibleAttendees}</p></div>
        <div className="rounded border bg-white p-3"><p className="text-slate-500">Refunded / Revoked</p><p className="text-lg font-semibold">{summary.refundedOrRevoked}</p></div>
        <div className="rounded border bg-white p-3"><p className="text-slate-500">Joined</p><p className="text-lg font-semibold">{summary.joined}</p></div>
        <div className="rounded border bg-white p-3"><p className="text-slate-500">Attended</p><p className="text-lg font-semibold">{summary.attended}</p></div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {tabLink(webinar.id, activeTab, "all", "All Registrations", attendeeRows.length)}
        {tabLink(webinar.id, activeTab, "eligible", "Eligible Attendees", eligibleRows.length)}
        {tabLink(webinar.id, activeTab, "refunded", "Refunded / Revoked", refundedRows.length)}
        {tabLink(webinar.id, activeTab, "attendance", "Attendance Activity", attendanceRows.length)}
      </div>

      <div className="mt-4 space-y-2">
        {visibleRows.map((row) => (
          <article key={row.id} className="rounded border bg-white p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium">{row.displayName}</p>
              <div className="flex flex-wrap gap-2">
                <StatusBadge status={row.isFree ? "not_required" : "paid"} label={row.isFree ? "Free" : "Paid"} />
                <StatusBadge status={row.payment_status} label={paymentBadgeLabel(row.payment_status)} />
                <StatusBadge status={row.registration_status} label={row.registration_status} />
                <StatusBadge status={row.access_status} label={accessBadgeLabel(row.access_status)} />
                {row.refundStatus ? <StatusBadge status={row.refundStatus} label={`Refund ${row.refundStatus}`} /> : null}
              </div>
            </div>
            <p className="text-slate-600">Email: {row.email}</p>
            <p className="text-slate-600">Phone: {row.phone}</p>
            <p className="mt-1 text-xs text-slate-500">Registered At: {row.registeredAt}</p>
            <p className="text-xs text-slate-500">Joined At: {row.joinedAt}</p>
            <p className="text-xs text-slate-500">Attended At: {row.attendedAt}</p>
            <p className="text-xs text-slate-500">Webinar Order ID: {row.webinar_order_id ?? "-"}</p>
            <p className="text-xs text-slate-500">Order Status: {row.orderStatus} · Order Payment: {row.orderPaymentStatus} · Order Access: {row.orderAccessStatus}</p>
          </article>
        ))}
        {visibleRows.length === 0 ? <p className="rounded border border-dashed bg-white p-8 text-center text-slate-600">No attendees in this section yet.</p> : null}
      </div>
    </div>
  );
}
