import { getSupabaseAdmin } from "@/lib/supabase/admin";

const paymentTables = [
  "entity_commissions",
  "webinar_commission_settings",
  "course_orders",
  "webinar_orders",
  "webinar_registrations",
  "psychometric_orders",
  "razorpay_transactions",
  "course_enrollments",
  "institute_payouts",
  "razorpay_webhook_logs",
] as const;

const requiredColumns: Partial<Record<(typeof paymentTables)[number], string[]>> = {
  webinar_orders: [
    "id",
    "webinar_id",
    "student_id",
    "institute_id",
    "amount",
    "currency",
    "payment_status",
    "order_status",
    "access_status",
    "platform_fee_percent",
    "platform_fee_amount",
    "payout_amount",
    "razorpay_order_id",
    "razorpay_payment_id",
  ],
  webinar_registrations: ["id", "webinar_id", "student_id", "webinar_order_id", "payment_status", "access_status"],
  webinar_commission_settings: ["id", "commission_percent", "is_active", "updated_at"],
  razorpay_transactions: [
    "id",
    "order_kind",
    "course_order_id",
    "psychometric_order_id",
    "webinar_order_id",
    "user_id",
    "institute_id",
    "razorpay_order_id",
    "razorpay_payment_id",
    "event_type",
    "payment_status",
    "amount",
    "currency",
    "verified",
    "verified_at",
    "gateway_response",
  ],
  razorpay_webhook_logs: ["id", "event_id", "event_type", "signature", "signature_valid", "headers", "processed", "processed_at", "notes", "payload"],
  institute_payouts: ["id", "webinar_order_id", "gross_amount", "platform_fee_amount", "payout_amount", "payout_source"],
};

export async function detectPaymentSchemaMismatches() {
  const admin = getSupabaseAdmin();
  if (!admin.ok) {
    return {
      envError: admin.error,
      missing: paymentTables.map((table) => table as string),
      missingColumns: [] as string[],
    };
  }

  const missing: string[] = [];
  const missingColumns: string[] = [];

  for (const tableName of paymentTables) {
    const { error } = await admin.data.from(tableName).select("id", { count: "exact", head: true });
    if (error) {
      missing.push(tableName);
      continue;
    }

    const columns = requiredColumns[tableName] ?? [];
    if (!columns.length) continue;

    const { error: columnError } = await admin.data.from(tableName).select(columns.join(","), { head: true, count: "exact" });
    if (columnError) {
      missingColumns.push(`${tableName}:${columns.join(",")}`);
    }
  }

  return { envError: null, missing, missingColumns };
}
