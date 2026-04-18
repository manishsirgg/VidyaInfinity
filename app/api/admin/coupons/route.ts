import { NextResponse } from "next/server";

import { writeAdminAuditLog } from "@/lib/admin/audit-log";
import { requireApiUser } from "@/lib/auth/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET() {
  const auth = await requireApiUser("admin");
  if ("error" in auth) return auth.error;

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const { data, error } = await admin.data
    .from("coupons")
    .select("id,code,discount_percentage,is_active,created_at,updated_at")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ coupons: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireApiUser("admin");
  if ("error" in auth) return auth.error;

  const body = await request.json();
  const code = String(body.code ?? "").trim().toUpperCase();
  const discountPercentage = Number(body.discountPercentage);
  const isActive = Boolean(body.isActive ?? true);

  if (!code || Number.isNaN(discountPercentage) || discountPercentage <= 0 || discountPercentage > 100) {
    return NextResponse.json({ error: "Valid code and discountPercentage (0-100) are required" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const { data, error } = await admin.data
    .from("coupons")
    .insert({
      code,
      discount_percentage: discountPercentage,
      is_active: isActive,
      created_by: auth.user.id,
      updated_by: auth.user.id,
    })
    .select("id,code,discount_percentage,is_active")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAdminAuditLog({
    adminUserId: auth.user.id,
    action: "COUPON_CREATED",
    targetTable: "coupons",
    targetId: data.id,
    metadata: { code: data.code, discountPercentage: data.discount_percentage, isActive: data.is_active },
  });

  return NextResponse.json({ ok: true, coupon: data });
}
