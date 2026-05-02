import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { writeAdminAuditLog } from "@/lib/admin/audit-log";

export async function POST(request: Request) {
  const auth = await requireApiUser("admin"); if ("error" in auth) return auth.error;
  const body = (await request.json()) as { orderType: "institute"|"course"|"webinar"; subscriptionId: string; reason: string; days: number };
  if (!body.reason?.trim()) return NextResponse.json({ error: "reason is required" }, { status: 400 });
  const admin = getSupabaseAdmin(); if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });
  const map: Record<string,string> = { institute:"institute_featured_subscriptions", course:"course_featured_subscriptions", webinar:"webinar_featured_subscriptions" };
  const table = map[body.orderType];
  const { data: row } = await admin.data.from(table).select("ends_at").eq("id", body.subscriptionId).maybeSingle<{ ends_at: string }>();
  if (!row?.ends_at) return NextResponse.json({ error: "subscription not found" }, { status: 404 });
  const next = new Date(new Date(row.ends_at).getTime() + Math.max(1, Number(body.days ?? 0)) * 86400000).toISOString();
  const { error } = await admin.data.from(table).update({ ends_at: next, updated_at: new Date().toISOString() }).eq("id", body.subscriptionId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await writeAdminAuditLog({ adminUserId: auth.user.id, actorUserId: auth.user.id, action: `featured_${body.orderType}_extend`, targetTable: table, targetId: body.subscriptionId, description: body.reason, metadata: { previousEndsAt: row.ends_at, nextEndsAt: next } });
  return NextResponse.json({ ok: true });
}
