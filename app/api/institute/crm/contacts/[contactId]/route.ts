import { NextResponse } from "next/server";
import { CRM_PRIORITIES, CRM_STAGES, inValues, isUuid, requireInstituteApiContext } from "@/lib/institute/crm";

export async function GET(_: Request, { params }: { params: Promise<{ contactId: string }> }) {
  const { contactId } = await params;
  if (!isUuid(contactId)) return NextResponse.json({ error: "Invalid contact id" }, { status: 400 });
  const ctx = await requireInstituteApiContext();
  if ("error" in ctx) return ctx.error;
  const { admin, instituteId } = ctx;
  const c = await admin.from("crm_contacts").select("*").eq("id", contactId).eq("owner_type", "institute").eq("owner_institute_id", instituteId).eq("is_deleted", false).maybeSingle();
  if (!c.data) return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  const [notes, followUps, acts] = await Promise.all([
    admin.from("crm_notes").select("*").eq("contact_id", contactId).eq("institute_id", instituteId).eq("is_deleted", false).order("created_at", { ascending: false }),
    admin.from("crm_follow_ups").select("*").eq("contact_id", contactId).eq("institute_id", instituteId).eq("is_deleted", false).order("due_at"),
    admin.from("crm_activities").select("*").eq("contact_id", contactId).eq("institute_id", instituteId).order("created_at", { ascending: false }),
  ]);
  return NextResponse.json({ contact: c.data, notes: notes.data ?? [], followUps: followUps.data ?? [], activities: acts.data ?? [] });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ contactId: string }> }) {
  const { contactId } = await params;
  if (!isUuid(contactId)) return NextResponse.json({ error: "Invalid contact id" }, { status: 400 });
  const ctx = await requireInstituteApiContext();
  if ("error" in ctx) return ctx.error;
  const { admin, instituteId, userId } = ctx;
  const existing = await admin.from("crm_contacts").select("id").eq("id", contactId).eq("owner_type", "institute").eq("owner_institute_id", instituteId).eq("is_deleted", false).maybeSingle();
  if (!existing.data) return NextResponse.json({ error: "Contact not found" }, { status: 404 });

  const body = await request.json();
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.lifecycle_stage && inValues(body.lifecycle_stage, CRM_STAGES)) update.lifecycle_stage = body.lifecycle_stage;
  if (body.priority && inValues(body.priority, CRM_PRIORITIES)) update.priority = body.priority;
  for (const k of ["assigned_to", "next_follow_up_at", "notes_summary", "converted", "converted_at", "lost_reason", "is_archived"]) if (k in body) update[k] = body[k];
  if (Object.keys(update).length === 1) return NextResponse.json({ error: "No valid fields provided" }, { status: 400 });

  const { data, error } = await admin.from("crm_contacts").update(update).eq("id", contactId).eq("owner_institute_id", instituteId).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await admin.from("crm_activities").insert({ contact_id: contactId, institute_id: instituteId, actor_user_id: userId, activity_type: "contact_updated", title: "Contact updated", metadata: { updatedFields: Object.keys(update) } });
  return NextResponse.json({ contact: data });
}
