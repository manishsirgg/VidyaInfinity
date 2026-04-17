import { NextResponse } from "next/server";

import { detectPaymentSchemaMismatches } from "@/lib/supabase/schema-guard";

const PAYMENT_MIGRATION_PATH =
  "supabase/migrations/20260417_000002_schema_alignment_for_orders_and_transactions.sql";

export async function getPaymentSchemaErrorResponse() {
  const result = await detectPaymentSchemaMismatches();

  if (result.envError) {
    return NextResponse.json({ error: result.envError }, { status: 500 });
  }

  if (!result.missing.length) {
    return null;
  }

  return NextResponse.json(
    {
      error: "Supabase payment schema mismatch",
      missingTables: result.missing,
      migration: `Run ${PAYMENT_MIGRATION_PATH}`,
    },
    { status: 500 }
  );
}
