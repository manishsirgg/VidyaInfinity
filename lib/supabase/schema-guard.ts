import { supabaseAdmin } from "@/lib/supabase/admin";

const paymentTables = ["platform_settings", "course_transactions", "test_purchases"] as const;

export async function detectPaymentSchemaMismatches() {
  const missing: string[] = [];

  for (const tableName of paymentTables) {
    const { error } = await supabaseAdmin.from(tableName).select("id", { count: "exact", head: true });
    if (error) missing.push(tableName);
  }

  return missing;
}
