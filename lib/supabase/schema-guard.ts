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
  | "institute_payout_requests"
  | "institute_payout_accounts"
  | "razorpay_webhook_logs";

export type PaymentSchemaDomain = "common" | "course" | "webinar" | "psychometric" | "webhook" | "payout";

const domainTables: Record<PaymentSchemaDomain, PaymentTable[]> = {
  common: ["coupons", "razorpay_transactions"],
  course: ["course_orders", "course_enrollments", "platform_commission_settings"],
  webinar: ["webinar_orders", "webinar_registrations", "webinar_commission_settings"],
  psychometric: ["psychometric_orders"],
  webhook: ["razorpay_webhook_logs"],
  payout: ["institute_payouts", "institute_payout_requests", "institute_payout_accounts"],
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
    "coupon_id",
    "attempt_id",
    "order_kind",
    "currency",
    "base_amount",
    "discount_percent",
    "discount_amount",
    "final_amount",
    "payment_status",
    "razorpay_order_id",
    "razorpay_payment_id",
    "razorpay_signature",
    "razorpay_receipt",
    "razorpay_method",
    "paid_at",
    "cancelled_at",
    "notes",
    "metadata",
    "created_at",
    "updated_at",
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
  institute_payout_requests: [
    "id",
    "institute_id",
    "payout_account_id",
    "status",
    "requested_amount",
    "approved_amount",
    "payment_reference",
    "paid_at",
  ],
  institute_payout_accounts: [
    "id",
    "institute_id",
    "account_type",
    "account_holder_name",
    "verification_status",
    "payout_mode",
    "auto_payout_enabled",
  ],
};

const requiredStatusCompatibilityChecks: Array<{
  table: PaymentTable;
  column: string;
  values: string[];
}> = [
  { table: "course_orders", column: "payment_status", values: ["created", "paid", "failed", "refunded"] },
  { table: "webinar_orders", column: "payment_status", values: ["pending", "paid", "failed", "refunded"] },
  { table: "psychometric_orders", column: "payment_status", values: ["created", "pending", "paid", "failed", "cancelled", "refunded"] },
  { table: "razorpay_transactions", column: "order_kind", values: ["course_enrollment", "psychometric_test", "webinar_registration"] },
  { table: "institute_payout_requests", column: "status", values: ["requested", "under_review", "approved", "processing", "paid", "failed", "rejected", "cancelled"] },
  { table: "institute_payout_accounts", column: "verification_status", values: ["pending", "approved", "rejected", "disabled"] },
];

const ZERO_UUID = "00000000-0000-0000-0000-000000000000";

const requiredRpcChecks: Array<{
  fn: string;
  domains: PaymentSchemaDomain[];
  variants: Array<Record<string, unknown>>;
}> = [
  {
    fn: "create_institute_payout_request",
    domains: ["payout"],
    variants: [
      { p_institute_id: ZERO_UUID, p_payout_account_id: ZERO_UUID, p_amount: 500 },
      { institute_id: ZERO_UUID, payout_account_id: ZERO_UUID, amount: 500 },
    ],
  },
  {
    fn: "admin_transition_payout_request",
    domains: ["payout"],
    variants: [
      {
        p_payout_request_id: ZERO_UUID,
        p_next_status: "paid",
        p_payment_reference: "schema_guard_probe",
        p_admin_note: "schema guard probe",
        p_admin_user_id: ZERO_UUID,
      },
      {
        payout_request_id: ZERO_UUID,
        next_status: "paid",
        payment_reference: "schema_guard_probe",
        admin_note: "schema guard probe",
        admin_user_id: ZERO_UUID,
      },
    ],
  },
  {
    fn: "get_next_featured_subscription_window",
    domains: ["payout"],
    variants: [{ p_institute_id: ZERO_UUID }, { institute_id: ZERO_UUID }],
  },
];

function looksLikeMissingRpc(errorMessage: string) {
  const normalized = errorMessage.toLowerCase();
  return (
    normalized.includes("could not find the function") ||
    normalized.includes("function") && normalized.includes("does not exist") ||
    normalized.includes("no function matches")
  );
}

export async function detectPaymentSchemaMismatches(domains?: PaymentSchemaDomain[]) {
  const admin = getSupabaseAdmin();
  const activeDomains = domains?.length ? domains : (["common", "course", "webinar", "psychometric", "webhook", "payout"] as PaymentSchemaDomain[]);
  const tablesToCheck = [...new Set(activeDomains.flatMap((domain) => domainTables[domain]))];

  if (!admin.ok) {
    return {
      envError: admin.error,
      missing: tablesToCheck.map((table) => table as string),
      missingColumns: [] as string[],
      incompatibleStatusValues: [] as string[],
      missingRpcs: [] as string[],
      incompatibleRpcSignatures: [] as string[],
    };
  }

  const missing: string[] = [];
  const missingColumns: string[] = [];
  const incompatibleStatusValues: string[] = [];
  const missingRpcs: string[] = [];
  const incompatibleRpcSignatures: string[] = [];

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

  const statusChecks = requiredStatusCompatibilityChecks.filter((check) => activeDomains.some((domain) => domainTables[domain].includes(check.table)));
  for (const check of statusChecks) {
    const { error } = await admin.data.from(check.table).select("id", { head: true, count: "exact" }).in(check.column, check.values);
    if (error) {
      incompatibleStatusValues.push(`${check.table}.${check.column}:${check.values.join("|")}`);
    }
  }

  const rpcChecks = requiredRpcChecks.filter((check) => check.domains.some((domain) => activeDomains.includes(domain)));
  for (const rpcCheck of rpcChecks) {
    let hasCompatibleVariant = false;
    let sawMissingRpc = false;

    for (const args of rpcCheck.variants) {
      const { error } = await admin.data.rpc(rpcCheck.fn, args);
      if (!error) {
        hasCompatibleVariant = true;
        break;
      }
      if (looksLikeMissingRpc(error.message)) {
        sawMissingRpc = true;
      } else {
        hasCompatibleVariant = true;
        break;
      }
    }

    if (sawMissingRpc && !hasCompatibleVariant) {
      missingRpcs.push(rpcCheck.fn);
      continue;
    }

    if (!hasCompatibleVariant) {
      incompatibleRpcSignatures.push(rpcCheck.fn);
    }
  }

  return { envError: null, missing, missingColumns, incompatibleStatusValues, missingRpcs, incompatibleRpcSignatures };
}
