import { NextResponse } from "next/server";
import { CRM_FOLLOWUP_CHANNEL, CRM_FOLLOWUP_STATUS, inValues, isUuid, requireInstituteApiContext } from "@/lib/institute/crm";

export async function PATCH(request: Request, { params }: { params: Promise<{ followUpId: string }> }) {
  const { followUpId } = await params; if (!isUuid(followUpId)) return NextResponse.json({ error: "Invalid follow-up id" }, { status: 400 });
  const ctx = await requireInstituteApiContext(); if ("error" in ctx) return ctx.error;
  const { admin, instituteId, userId } = ctx; const body = await request.json();
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.status && inValues(body.status, CRM_FOLLOWUP_STATUS)) update.status = body.status;
  if (body.channel && inValues(body.channel, CRM_FOLLOWUP_CHANNEL)) update.channel = body.channel;
  for (const k of ["purpose","notes","due_at","completed_at","cancelled_at"]) if (k in body) update[k]=body[k];
  const { data, error } = await admin.from("crm_follow_ups").update(update).eq("id", followUpId).eq("institute_id", instituteId).eq("is_deleted", false).select("*").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 }); if (!data) return NextResponse.json({ error: "Follow-up not found" }, { status: 404 });
  if (update.status === "completed") await admin.from("crm_activities").insert({ contact_id: data.contact_id, institute_id: instituteId, actor_user_id: userId, activity_type: "follow_up_completed", title: "Follow-up completed", metadata: { followUpId } });
  return NextResponse.json({ followUp: data });
}
export async function DELETE(_: Request, { params }: { params: Promise<{ followUpId: string }> }) {
  const { followUpId } = await params; if (!isUuid(followUpId)) return NextResponse.json({ error: "Invalid follow-up id" }, { status: 400 });
  const ctx = await requireInstituteApiContext(); if ("error" in ctx) return ctx.error;
  const { admin, instituteId, userId } = ctx;
  const { data } = await admin.from("crm_follow_ups").update({ is_deleted: true, deleted_at: new Date().toISOString(), deleted_by: userId }).eq("id", followUpId).eq("institute_id", instituteId).eq("is_deleted", false).select("id").maybeSingle();
  if (!data) return NextResponse.json({ error: "Follow-up not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
