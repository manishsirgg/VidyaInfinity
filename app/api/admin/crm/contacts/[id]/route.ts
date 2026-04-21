import { NextResponse } from "next/server";

import { createCrmActivity, isCrmPriority, isCrmStatus } from "@/lib/admin/crm";
import { writeAdminAuditLog } from "@/lib/admin/audit-log";
import { requireApiUser } from "@/lib/auth/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser("admin");
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const [contactResp, notesResp, activityResp, followUpsResp, tagsResp] = await Promise.all([
    admin.data.from("crm_contacts").select("*").eq("id", id).maybeSingle(),
    admin.data.from("crm_notes").select("*").eq("contact_id", id).order("created_at", { ascending: false }),
    admin.data.from("crm_activities").select("*").eq("contact_id", id).order("created_at", { ascending: false }),
    admin.data.from("crm_follow_ups").select("*").eq("contact_id", id).order("due_at", { ascending: true }),
    admin.data
      .from("crm_contact_tags")
      .select("id,tag_id,crm_tags(id,name,color)")
      .eq("contact_id", id),
  ]);

  if (contactResp.error || !contactResp.data) {
    return NextResponse.json({ error: contactResp.error?.message ?? "Contact not found" }, { status: 404 });
  }

  const contact = contactResp.data;

  let linkedProfile: unknown = null;
  if (contact.linked_profile_id) {
    linkedProfile = (
      await admin.data
        .from("profiles")
        .select("id,full_name,email,phone,role")
        .eq("id", contact.linked_profile_id)
        .maybeSingle()
    ).data;
  }

  let linkedInstitute: unknown = null;
  if (contact.linked_institute_id) {
    linkedInstitute = (
      await admin.data
        .from("institutes")
        .select("id,name,city,state,country,status")
        .eq("id", contact.linked_institute_id)
        .maybeSingle()
    ).data;
  }

  return NextResponse.json({
    contact,
    notes: notesResp.data ?? [],
    activities: activityResp.data ?? [],
    followUps: followUpsResp.data ?? [],
    tags: (tagsResp.data ?? []).map((row) => ({
      contactTagId: row.id,
      tagId: row.tag_id,
      tag: Array.isArray(row.crm_tags) ? row.crm_tags[0] : row.crm_tags,
    })),
    linkedProfile,
    linkedInstitute,
  });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser("admin");
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const body = await request.json();

  const lifecycleStage = typeof body.lifecycle_stage === "string" ? body.lifecycle_stage.trim().toLowerCase() : undefined;
  const priority = typeof body.priority === "string" ? body.priority.trim().toLowerCase() : undefined;
  const assignedTo = typeof body.assigned_to === "string" ? body.assigned_to.trim() : undefined;
  const nextFollowUpAt = typeof body.next_follow_up_at === "string" ? body.next_follow_up_at : undefined;

  if (lifecycleStage && !isCrmStatus(lifecycleStage)) {
    return NextResponse.json({ error: "Invalid lifecycle_stage" }, { status: 400 });
  }

  if (priority && !isCrmPriority(priority)) {
    return NextResponse.json({ error: "Invalid priority" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const { data: existing, error: lookupError } = await admin.data
    .from("crm_contacts")
    .select("id,lifecycle_stage,priority,assigned_to,next_follow_up_at")
    .eq("id", id)
    .maybeSingle();

  if (lookupError || !existing) {
    return NextResponse.json({ error: lookupError?.message ?? "Contact not found" }, { status: 404 });
  }

  const updatePayload: Record<string, unknown> = {};
  if (lifecycleStage) updatePayload.lifecycle_stage = lifecycleStage;
  if (priority) updatePayload.priority = priority;
  if (assignedTo !== undefined) updatePayload.assigned_to = assignedTo || null;
  if (nextFollowUpAt !== undefined) updatePayload.next_follow_up_at = nextFollowUpAt || null;

  if (!Object.keys(updatePayload).length) {
    return NextResponse.json({ error: "No valid fields provided" }, { status: 400 });
  }

  updatePayload.updated_at = new Date().toISOString();

  const { data: updated, error: updateError } = await admin.data.from("crm_contacts").update(updatePayload).eq("id", id).select("*").maybeSingle();

  if (updateError || !updated) {
    return NextResponse.json({ error: updateError?.message ?? "Unable to update contact" }, { status: 500 });
  }

  if (lifecycleStage && existing.lifecycle_stage !== lifecycleStage) {
    await createCrmActivity({
      contactId: id,
      adminUserId: auth.user.id,
      activityType: "status_changed",
      title: "Lifecycle stage changed",
      description: `${existing.lifecycle_stage ?? "unknown"} → ${lifecycleStage}`,
      metadata: { before: existing.lifecycle_stage, after: lifecycleStage },
    });
  }

  if (priority && existing.priority !== priority) {
    await createCrmActivity({
      contactId: id,
      adminUserId: auth.user.id,
      activityType: "priority_changed",
      title: "Priority changed",
      description: `${existing.priority ?? "unknown"} → ${priority}`,
      metadata: { before: existing.priority, after: priority },
    });
  }

  if (assignedTo !== undefined && existing.assigned_to !== (assignedTo || null)) {
    await createCrmActivity({
      contactId: id,
      adminUserId: auth.user.id,
      activityType: "assignment_changed",
      title: "Assignee changed",
      description: `${existing.assigned_to ?? "unassigned"} → ${assignedTo || "unassigned"}`,
      metadata: { before: existing.assigned_to, after: assignedTo || null },
    });
  }

  await writeAdminAuditLog({
    adminUserId: auth.user.id,
    action: "CRM_CONTACT_UPDATED",
    targetTable: "crm_contacts",
    targetId: id,
    metadata: { updatePayload },
  });

  return NextResponse.json({ contact: updated });
}
