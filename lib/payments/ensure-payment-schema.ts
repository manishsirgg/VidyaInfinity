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

  const hasHardBlockers = result.missing.length > 0 || result.missingColumns.length > 0;
  const hasSoftWarnings = result.incompatibleStatusValues.length > 0 || result.missingRpcs.length > 0 || result.incompatibleRpcSignatures.length > 0;

  if (!hasHardBlockers && hasSoftWarnings) {
    console.warn("[payments/schema-guard] compatibility warnings detected (non-blocking)", {
      domains: domains ?? ["common", "course", "webinar", "psychometric", "webhook", "payout"],
      incompatibleStatusValues: result.incompatibleStatusValues,
      missingRpcs: result.missingRpcs,
      incompatibleRpcSignatures: result.incompatibleRpcSignatures,
    });
  }

  if (!hasHardBlockers && !hasSoftWarnings) {
    return null;
  }

  if (!hasHardBlockers) {
    return null;
  }

  console.error("[payments/schema-guard] blocking schema mismatch detected", {
    domains: domains ?? ["common", "course", "webinar", "psychometric", "webhook", "payout"],
    missingTables: result.missing,
    missingColumns: result.missingColumns,
    incompatibleStatusValues: result.incompatibleStatusValues,
    missingRpcs: result.missingRpcs,
    incompatibleRpcSignatures: result.incompatibleRpcSignatures,
  });

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
