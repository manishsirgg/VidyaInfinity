import { NextResponse } from "next/server";
import { CRM_FOLLOW_UP_CHANNELS, CRM_FOLLOW_UP_STATUSES, inValues, isUuid, requireInstituteApiContext } from "@/lib/institute/crm";

export async function POST(request: Request, { params }: { params: Promise<{ contactId: string }> }) {
  const { contactId } = await params; if (!isUuid(contactId)) return NextResponse.json({ error: "Invalid contact id" }, { status: 400 });
  const ctx = await requireInstituteApiContext(); if ("error" in ctx) return ctx.error;
  const { admin, instituteId, userId } = ctx;
  const body = await request.json();
  if (!body.due_at || !body.purpose || !body.channel) return NextResponse.json({ error: "due_at, channel, and purpose are required" }, { status: 400 });
  const status = typeof body.status === "string" ? body.status : "scheduled";
  if (!inValues(status, CRM_FOLLOW_UP_STATUSES)) return NextResponse.json({ error: "Invalid follow-up status" }, { status: 400 });
  const channel = typeof body.channel === "string" ? body.channel : "other";
  if (!inValues(channel, CRM_FOLLOW_UP_CHANNELS)) return NextResponse.json({ error: "Invalid follow-up channel" }, { status: 400 });
  const { data, error } = await admin.from("crm_follow_ups").insert({ contact_id: contactId, institute_id: instituteId, assigned_to: body.assigned_to ?? userId, created_by: userId, status, channel, purpose: body.purpose, notes: body.notes ?? null, due_at: body.due_at, metadata: body.metadata ?? {} }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await admin.from("crm_activities").insert({ contact_id: contactId, institute_id: instituteId, actor_user_id: userId, activity_type: "follow_up_created", title: "Follow-up scheduled", metadata: { followUpId: data.id } });
  return NextResponse.json({ followUp: data });
}
