import { getSupabaseAdmin } from "@/lib/supabase/admin";

type PaymentTable =
  | "coupons"
  | "platform_commission_settings"
  | "webinar_commission_settings"
  | "course_orders"
  | "webinar_orders"
  | "webinar_registrations"
  | "psychometric_orders"
  | "razorpay_transactions"
  | "course_enrollments"
  | "institute_payouts"
  | "razorpay_webhook_logs";

export type PaymentSchemaDomain = "common" | "course" | "webinar" | "psychometric" | "webhook";

const domainTables: Record<PaymentSchemaDomain, PaymentTable[]> = {
  common: ["coupons", "razorpay_transactions"],
  course: ["course_orders", "course_enrollments", "institute_payouts", "platform_commission_settings"],
  webinar: ["webinar_orders", "webinar_registrations", "webinar_commission_settings", "institute_payouts"],
  psychometric: ["psychometric_orders"],
  webhook: ["razorpay_webhook_logs"],
};

const requiredColumns: Partial<Record<PaymentTable, string[]>> = {
  coupons: ["id", "code", "discount_percent", "active", "expiry_date", "applies_to"],
  course_orders: [
    "id",
    "student_id",
    "course_id",
    "institute_id",
    "payment_status",
    "gross_amount",
    "commission_percent",
    "platform_fee_amount",
    "institute_receivable_amount",
    "currency",
    "razorpay_order_id",
    "razorpay_payment_id",
  ],
  course_enrollments: ["id", "course_order_id", "student_id", "course_id", "institute_id", "enrollment_status"],
  platform_commission_settings: ["id", "key"],
  psychometric_orders: [
    "id",
    "user_id",
    "test_id",
    "payment_status",
    "base_amount",
    "discount_amount",
    "final_paid_amount",
    "coupon_code",
    "currency",
    "razorpay_order_id",
    "razorpay_payment_id",
  ],
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
  webinar_registrations: [
    "id",
    "webinar_id",
    "student_id",
    "institute_id",
    "webinar_order_id",
    "registration_status",
    "payment_status",
    "access_status",
    "access_start_at",
    "access_end_at",
  ],
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
  institute_payouts: ["id", "institute_id", "course_order_id", "gross_amount", "platform_fee_amount", "payout_amount", "payout_status"],
};

export async function detectPaymentSchemaMismatches(domains?: PaymentSchemaDomain[]) {
  const admin = getSupabaseAdmin();
  const activeDomains = domains?.length ? domains : (["common", "course", "webinar", "psychometric", "webhook"] as PaymentSchemaDomain[]);
  const tablesToCheck = [...new Set(activeDomains.flatMap((domain) => domainTables[domain]))];

  if (!admin.ok) {
    return {
      envError: admin.error,
      missing: tablesToCheck.map((table) => table as string),
      missingColumns: [] as string[],
    };
  }

  const missing: string[] = [];
  const missingColumns: string[] = [];

  for (const tableName of tablesToCheck) {
    const { error } = await admin.data.from(tableName).select("id", { count: "exact", head: true });
    if (error) {
      missing.push(tableName);
      continue;
    }


    if (tableName === "platform_commission_settings") {
      const baseColumns = requiredColumns[tableName] ?? [];
      const commissionColumnVariants = [
        [...baseColumns, "commission_percent"],
        [...baseColumns, "commission_percentage"],
      ];

      let hasCompatibleCommissionColumn = false;
      for (const columns of commissionColumnVariants) {
        const { error: variantError } = await admin.data
          .from(tableName)
          .select(columns.join(","), { head: true, count: "exact" });

        if (!variantError) {
          hasCompatibleCommissionColumn = true;
          break;
        }
      }

      if (!hasCompatibleCommissionColumn) {
        missingColumns.push(`${tableName}:id,key,commission_percent|commission_percentage`);
      }

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
