import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { writeAdminAuditLog } from "@/lib/admin/audit-log";

export async function POST(request: Request) {
  const auth = await requireApiUser("admin"); if ("error" in auth) return auth.error;
  const body = (await request.json()) as { orderType: "institute"|"course"|"webinar"; subscriptionId: string; reason: string };
  if (!body.reason?.trim()) return NextResponse.json({ error: "reason is required" }, { status: 400 });
  const admin = getSupabaseAdmin(); if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });
  const map: Record<string,string> = { institute:"institute_featured_subscriptions", course:"course_featured_subscriptions", webinar:"webinar_featured_subscriptions" };
  const table = map[body.orderType];
  const now = new Date().toISOString();
  const { error } = await admin.data.from(table).update({ status: "cancelled", cancelled_at: now, cancelled_reason: body.reason, updated_at: now }).eq("id", body.subscriptionId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await writeAdminAuditLog({ adminUserId: auth.user.id, actorUserId: auth.user.id, action: `featured_${body.orderType}_cancel`, targetTable: table, targetId: body.subscriptionId, description: body.reason });
  return NextResponse.json({ ok: true });
}
