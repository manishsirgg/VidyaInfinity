import { NextResponse } from "next/server";

import { detectPaymentSchemaMismatches } from "@/lib/supabase/schema-guard";

const PAYMENT_MIGRATION_PATH =
  "supabase/migrations/20260417_000001_payment_order_commission_foundation.sql";

export async function getPaymentSchemaErrorResponse() {
  const missingTables = await detectPaymentSchemaMismatches();

  if (!missingTables.length) {
    return null;
  }

  return NextResponse.json(
    {
      error: "Supabase payment schema mismatch",
      missingTables,
      migration: `Run ${PAYMENT_MIGRATION_PATH}`,
    },
    { status: 500 }
  );
}
