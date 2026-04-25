import { NextResponse } from "next/server";

import { detectPaymentSchemaMismatches, type PaymentSchemaDomain } from "@/lib/supabase/schema-guard";

const PAYMENT_MIGRATION_PATHS = [
  "supabase/migrations/20260417_000002_schema_alignment_for_orders_and_transactions.sql",
  "supabase/migrations/20260419_000014_webinars_and_featured_subscriptions.sql",
  "supabase/migrations/20260420_000015_simplified_entity_and_webinar_commissions.sql",
  "supabase/migrations/20260420_000016_webinar_commission_singleton.sql",
  "supabase/migrations/20260420_000017_webinar_orders_and_registrations.sql",
  "supabase/migrations/20260420_000018_razorpay_reconciliation_schema_alignment.sql",
  "supabase/migrations/20260421_000018_notifications_platform_upgrade.sql",
  "supabase/migrations/20260421_000020_course_payment_schema_parity_patch.sql",
];

export async function getPaymentSchemaErrorResponse(domains?: PaymentSchemaDomain[]) {
  const result = await detectPaymentSchemaMismatches(domains);

  if (result.envError) {
    return NextResponse.json({ error: result.envError }, { status: 500 });
  }

  if (
    !result.missing.length &&
    !result.missingColumns.length &&
    !result.incompatibleStatusValues.length &&
    !result.missingRpcs.length &&
    !result.incompatibleRpcSignatures.length
  ) {
    return null;
  }

  return NextResponse.json(
    {
      error: "Payment schema is missing required tables/columns or has incompatible status/RPC expectations.",
      missingTables: result.missing,
      missingColumns: result.missingColumns,
      incompatibleStatusValues: result.incompatibleStatusValues,
      missingRpcs: result.missingRpcs,
      incompatibleRpcSignatures: result.incompatibleRpcSignatures,
      migration: `Run migrations: ${PAYMENT_MIGRATION_PATHS.join(", ")}`,
    },
    { status: 500 }
  );
}
