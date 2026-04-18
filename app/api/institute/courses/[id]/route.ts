import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type Params = {
  params: Promise<{ id: string }>;
};

function toNullableDate(value: unknown) {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireApiUser("institute");
  if ("error" in auth) return auth.error;

  const { user } = auth;
  const { id } = await params;
  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const { data: institute } = await admin.data.from("institutes").select("id").eq("user_id", user.id).maybeSingle();
  if (!institute) return NextResponse.json({ error: "Institute record not found" }, { status: 404 });

  const payload = await request.json();

  const updates: Record<string, unknown> = {};
  if (typeof payload.title === "string" && payload.title.trim()) updates.title = payload.title.trim();
  if (typeof payload.summary === "string" && payload.summary.trim()) updates.summary = payload.summary.trim();
  if (payload.feeAmount !== undefined) {
    const feeAmount = Number(payload.feeAmount);
    if (!Number.isFinite(feeAmount) || feeAmount <= 0) {
      return NextResponse.json({ error: "feeAmount must be a positive number" }, { status: 400 });
    }
    updates.fee_amount = feeAmount;
  }
  if (payload.startDate !== undefined) updates.start_date = toNullableDate(payload.startDate);
  if (payload.totalSeats !== undefined) {
    const totalSeats = Number(payload.totalSeats);
    if (!Number.isInteger(totalSeats) || totalSeats < 0) {
      return NextResponse.json({ error: "totalSeats must be a non-negative integer" }, { status: 400 });
    }
    updates.total_seats = totalSeats;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields supplied to update" }, { status: 400 });
  }

  updates.approval_status = "pending";
  updates.status = "pending";
  updates.rejection_reason = null;
  updates.updated_at = new Date().toISOString();

  const { data: course, error } = await admin.data
    .from("courses")
    .update(updates)
    .eq("id", id)
    .eq("institute_id", institute.id)
    .select("id")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!course) return NextResponse.json({ error: "Course not found" }, { status: 404 });

  return NextResponse.json({ ok: true, message: "Course updated and submitted for approval." });
}

export async function DELETE(_: Request, { params }: Params) {
  const auth = await requireApiUser("institute");
  if ("error" in auth) return auth.error;

  const { user } = auth;
  const { id } = await params;
  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const { data: institute } = await admin.data.from("institutes").select("id").eq("user_id", user.id).maybeSingle();
  if (!institute) return NextResponse.json({ error: "Institute record not found" }, { status: 404 });

  const { data: existing } = await admin.data
    .from("courses")
    .select("id")
    .eq("id", id)
    .eq("institute_id", institute.id)
    .maybeSingle();

  if (!existing) return NextResponse.json({ error: "Course not found" }, { status: 404 });

  const { count: orderCount } = await admin.data
    .from("course_orders")
    .select("id", { count: "exact", head: true })
    .eq("course_id", id)
    .in("payment_status", ["created", "paid", "refunded"]);

  if ((orderCount ?? 0) > 0) {
    return NextResponse.json(
      { error: "This course has payment records. It cannot be deleted and should be unpublished instead." },
      { status: 409 }
    );
  }

  const { error } = await admin.data.from("courses").delete().eq("id", id).eq("institute_id", institute.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
