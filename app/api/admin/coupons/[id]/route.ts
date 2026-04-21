import { NextResponse } from "next/server";

import { writeAdminAuditLog } from "@/lib/admin/audit-log";
import { requireApiUser } from "@/lib/auth/api-auth";
import { isCouponScope, normalizeCouponCode } from "@/lib/coupons";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser("admin");
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const body = await request.json();

  const updates: Record<string, unknown> = {};

  if (body.code !== undefined) {
    const nextCode = normalizeCouponCode(body.code);
    if (!nextCode) return NextResponse.json({ error: "code cannot be empty" }, { status: 400 });
    updates.code = nextCode;
  }

  if (body.appliesTo !== undefined) {
    if (!isCouponScope(body.appliesTo)) {
      return NextResponse.json({ error: "appliesTo must be course, webinar, or psychometric" }, { status: 400 });
    }
    updates.applies_to = body.appliesTo;
  }

  if (body.discountPercentage !== undefined) {
    const nextDiscount = Number(body.discountPercentage);
    if (Number.isNaN(nextDiscount) || nextDiscount <= 0 || nextDiscount > 100) {
      return NextResponse.json({ error: "discountPercentage must be between 0 and 100" }, { status: 400 });
    }
    updates.discount_percent = nextDiscount;
  }

  if (body.expiryDate !== undefined) {
    if (body.expiryDate === null || body.expiryDate === "") {
      updates.expiry_date = null;
    } else {
      const nextExpiryDate = String(body.expiryDate);
      if (Number.isNaN(new Date(nextExpiryDate).getTime())) {
        return NextResponse.json({ error: "expiryDate must be a valid date or null" }, { status: 400 });
      }
      updates.expiry_date = nextExpiryDate;
    }
  }

  if (body.isActive !== undefined) {
    updates.active = Boolean(body.isActive);
  }

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const { data, error } = await admin.data
    .from("coupons")
    .update(updates)
    .eq("id", id)
    .select("id,code,discount_percent,expiry_date,active,applies_to,created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAdminAuditLog({
    adminUserId: auth.user.id,
    action: "COUPON_UPDATED",
    targetTable: "coupons",
    targetId: id,
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

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser("admin");
  if ("error" in auth) return auth.error;

  const { id } = await params;

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const { data: existing } = await admin.data.from("coupons").select("id,code,active").eq("id", id).maybeSingle();
  if (!existing) return NextResponse.json({ error: "Coupon not found" }, { status: 404 });

  const [{ count: usedInCourseOrders }, { count: usedInPsychometricOrders }, { count: usedInWebinarOrders }] = await Promise.all([
    admin.data.from("course_orders").select("id", { count: "exact", head: true }).eq("coupon_code", existing.code),
    admin.data.from("psychometric_orders").select("id", { count: "exact", head: true }).eq("coupon_code", existing.code),
    admin.data.from("webinar_orders").select("id", { count: "exact", head: true }).eq("coupon_code", existing.code),
  ]);

  const { data, error } = await admin.data
    .from("coupons")
    .update({ active: false })
    .eq("id", id)
    .select("id,code,discount_percent,expiry_date,active,applies_to,created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAdminAuditLog({
    adminUserId: auth.user.id,
    actorUserId: auth.user.id,
    action: "COUPON_DEACTIVATED",
    targetTable: "coupons",
    targetId: id,
    description: `Coupon ${existing.code} deactivated instead of deletion.`,
    oldData: existing,
    metadata: {
      dependencyChecks: {
        usedInCourseOrders: usedInCourseOrders ?? 0,
        usedInPsychometricOrders: usedInPsychometricOrders ?? 0,
        usedInWebinarOrders: usedInWebinarOrders ?? 0,
      },
    },
  });

  return NextResponse.json({ ok: true, coupon: data, message: "Coupon deactivated" });
}
