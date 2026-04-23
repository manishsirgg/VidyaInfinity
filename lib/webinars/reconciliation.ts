import type { SupabaseClient } from "@supabase/supabase-js";

import { deliverWebinarAccess } from "@/lib/webinars/access-delivery";

type PaidWebinarOrder = {
  id: string;
  webinar_id: string;
  student_id: string;
  institute_id: string;
  paid_at: string | null;
  created_at: string;
  webinars: { starts_at: string | null; ends_at: string | null } | { starts_at: string | null; ends_at: string | null }[] | null;
};

type WebinarRegistrationRow = {
  id: string;
  webinar_id: string;
  student_id: string;
  webinar_order_id: string | null;
  payment_status: string | null;
  access_status: string | null;
};

function pickOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export async function reconcilePaidWebinarRegistrations(supabase: SupabaseClient) {
  const { data: paidOrders, error: paidOrdersError } = await supabase
    .from("webinar_orders")
    .select("id,webinar_id,student_id,institute_id,paid_at,created_at,webinars(starts_at,ends_at)")
    .eq("payment_status", "paid")
    .in("order_status", ["confirmed", "completed"])
    .order("paid_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false, nullsFirst: false })
    .returns<PaidWebinarOrder[]>();

  if (paidOrdersError) {
    return { error: paidOrdersError.message, fixedMissingRegistration: 0, fixedPendingAccess: 0, inspectedOrders: 0 };
  }

  let fixedMissingRegistration = 0;
  let fixedPendingAccess = 0;

  for (const order of paidOrders ?? []) {
    const webinar = pickOne(order.webinars);
    const registeredAt = order.paid_at ?? order.created_at ?? new Date().toISOString();

    const { data: existingRegistration, error: registrationReadError } = await supabase
      .from("webinar_registrations")
      .select("id,webinar_id,student_id,webinar_order_id,payment_status,access_status")
      .eq("webinar_id", order.webinar_id)
      .eq("student_id", order.student_id)
      .limit(1)
      .maybeSingle<WebinarRegistrationRow>();

    if (registrationReadError) {
      return { error: registrationReadError.message, fixedMissingRegistration, fixedPendingAccess, inspectedOrders: paidOrders?.length ?? 0 };
    }

    if (!existingRegistration) {
      const { error: insertError } = await supabase.from("webinar_registrations").upsert(
        {
          webinar_id: order.webinar_id,
          student_id: order.student_id,
          institute_id: order.institute_id,
          webinar_order_id: order.id,
          registration_status: "registered",
          payment_status: "paid",
          access_status: "granted",
          registered_at: registeredAt,
          access_start_at: webinar?.starts_at ?? registeredAt,
          access_end_at: webinar?.ends_at ?? null,
          metadata: { source: "reconciliation_backfill", webinar_order_id: order.id },
        },
        { onConflict: "webinar_id,student_id" },
      );

      if (insertError) return { error: insertError.message, fixedMissingRegistration, fixedPendingAccess, inspectedOrders: paidOrders?.length ?? 0 };

      fixedMissingRegistration += 1;
      console.info("[webinars/reconcile] reconciliation_fixed_missing_registration", {
        event: "reconciliation_fixed_missing_registration",
        webinar_order_id: order.id,
        webinar_id: order.webinar_id,
        student_id: order.student_id,
      });
    } else if (existingRegistration.access_status !== "granted") {
      const { error: updateError } = await supabase
        .from("webinar_registrations")
        .update({
          access_status: "granted",
          payment_status: "paid",
          webinar_order_id: order.id,
          institute_id: order.institute_id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingRegistration.id);

      if (updateError) return { error: updateError.message, fixedMissingRegistration, fixedPendingAccess, inspectedOrders: paidOrders?.length ?? 0 };

      fixedPendingAccess += 1;
      console.info("[webinars/reconcile] reconciliation_fixed_pending_access", {
        event: "reconciliation_fixed_pending_access",
        webinar_order_id: order.id,
        webinar_id: order.webinar_id,
        student_id: order.student_id,
        registration_id: existingRegistration.id,
      });
    }

    const { data: registrationToDeliver } = await supabase
      .from("webinar_registrations")
      .select("id")
      .eq("webinar_id", order.webinar_id)
      .eq("student_id", order.student_id)
      .eq("access_status", "granted")
      .limit(1)
      .maybeSingle<{ id: string }>();

    if (registrationToDeliver?.id) {
      await deliverWebinarAccess({
        supabase,
        registrationId: registrationToDeliver.id,
        webinarId: order.webinar_id,
        studentId: order.student_id,
      }).catch(() => undefined);
    }
  }

  return {
    error: null,
    fixedMissingRegistration,
    fixedPendingAccess,
    inspectedOrders: paidOrders?.length ?? 0,
  };
}
