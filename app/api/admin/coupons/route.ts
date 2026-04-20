import { NextResponse } from "next/server";

import { writeAdminAuditLog } from "@/lib/admin/audit-log";
import { requireApiUser } from "@/lib/auth/api-auth";
import { couponScopes, isCouponScope, normalizeCouponCode } from "@/lib/coupons";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET() {
  const auth = await requireApiUser("admin");
  if ("error" in auth) return auth.error;

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const { data, error } = await admin.data
    .from("coupons")
    .select("id,code,discount_percent,expiry_date,active,applies_to,created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ coupons: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireApiUser("admin");
  if ("error" in auth) return auth.error;

  const body = await request.json();
  const code = normalizeCouponCode(body.code);
  const appliesTo = body.appliesTo;
  const discountPercentage = Number(body.discountPercentage);
  const expiryDate = body.expiryDate ? String(body.expiryDate) : null;
  const isActive = Boolean(body.isActive ?? true);

  if (!code || !isCouponScope(appliesTo) || Number.isNaN(discountPercentage) || discountPercentage <= 0 || discountPercentage > 100) {
    return NextResponse.json({ error: `Valid code, appliesTo (${couponScopes.join(", ")}), and discountPercentage (0-100) are required` }, { status: 400 });
  }

  if (expiryDate && Number.isNaN(new Date(expiryDate).getTime())) {
    return NextResponse.json({ error: "expiryDate must be a valid date" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const { data, error } = await admin.data
    .from("coupons")
    .insert({
      code,
      applies_to: appliesTo,
      discount_percent: discountPercentage,
      expiry_date: expiryDate,
      active: isActive,
    })
    .select("id,code,discount_percent,expiry_date,active,applies_to,created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAdminAuditLog({
    adminUserId: auth.user.id,
    action: "COUPON_CREATED",
    targetTable: "coupons",
    targetId: data.id,
    metadata: {
      code: data.code,
      appliesTo: data.applies_to,
      discountPercentage: data.discount_percent,
      expiryDate: data.expiry_date,
      isActive: data.active,
    },
  });

  return NextResponse.json({ ok: true, coupon: data });
}
