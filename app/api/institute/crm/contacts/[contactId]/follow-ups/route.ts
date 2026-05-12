import { NextResponse } from "next/server";
import { CRM_FOLLOWUP_CHANNEL, CRM_FOLLOWUP_STATUS, inValues, isUuid, requireInstituteApiContext } from "@/lib/institute/crm";

export async function POST(request: Request, { params }: { params: Promise<{ contactId: string }> }) {
  const { contactId } = await params; if (!isUuid(contactId)) return NextResponse.json({ error: "Invalid contact id" }, { status: 400 });
  const ctx = await requireInstituteApiContext(); if ("error" in ctx) return ctx.error;
  const { admin, instituteId, userId } = ctx;
  const body = await request.json();
  if (!body.due_at || !body.purpose || !body.channel) return NextResponse.json({ error: "due_at, channel, and purpose are required" }, { status: 400 });
  const status = typeof body.status === "string" && inValues(body.status, CRM_FOLLOWUP_STATUS) ? body.status : "pending";
  const channel = typeof body.channel === "string" && inValues(body.channel, CRM_FOLLOWUP_CHANNEL) ? body.channel : "other";
  const { data, error } = await admin.from("crm_follow_ups").insert({ contact_id: contactId, institute_id: instituteId, assigned_to: body.assigned_to ?? userId, created_by: userId, status, channel, purpose: body.purpose, notes: body.notes ?? null, due_at: body.due_at, metadata: body.metadata ?? {} }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await admin.from("crm_activities").insert({ contact_id: contactId, institute_id, actor_user_id: userId, activity_type: "follow_up_created", title: "Follow-up scheduled", metadata: { followUpId: data.id } });
  return NextResponse.json({ followUp: data });
}
