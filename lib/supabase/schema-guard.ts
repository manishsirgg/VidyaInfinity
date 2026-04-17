import { getSupabaseAdmin } from "@/lib/supabase/admin";

const paymentTables = [
  "platform_commission_settings",
  "course_orders",
  "psychometric_orders",
  "razorpay_transactions",
  "course_enrollments",
  "institute_payouts",
  "razorpay_webhook_logs",
] as const;

export async function detectPaymentSchemaMismatches() {
  const admin = getSupabaseAdmin();
  if (!admin.ok) {
    return { envError: admin.error, missing: paymentTables.map((table) => table as string) };
  }

  const missing: string[] = [];

  for (const tableName of paymentTables) {
    const { error } = await admin.data.from(tableName).select("id", { count: "exact", head: true });
    if (error) missing.push(tableName);
  }

  return { envError: null, missing };
}
