import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { reconcilePaidWebinarRegistrations } from "@/lib/webinars/reconciliation";

function hasValidCronKey(request: Request) {
  const configured = process.env.WEBINAR_RECONCILE_CRON_KEY;
  if (!configured) return false;
  const provided = request.headers.get("x-reconcile-key");
  return Boolean(provided && provided === configured);
}

export async function POST(request: Request) {
  const authorizedViaCronKey = hasValidCronKey(request);
  if (!authorizedViaCronKey) {
    const auth = await requireApiUser("admin", { requireApproved: false });
    if ("error" in auth) return auth.error;
  }

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 503 });

  const result = await reconcilePaidWebinarRegistrations(admin.data);
  if (result.error) return NextResponse.json({ error: result.error }, { status: 500 });

  return NextResponse.json({
    ok: true,
    inspected_orders: result.inspectedOrders,
    reconciliation_fixed_missing_registration: result.fixedMissingRegistration,
    reconciliation_fixed_pending_access: result.fixedPendingAccess,
  });
}
