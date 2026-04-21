import { NextResponse } from "next/server";

import { createCrmActivity } from "@/lib/admin/crm";
import { writeAdminAuditLog } from "@/lib/admin/audit-log";
import { requireApiUser } from "@/lib/auth/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string) {
  return UUID_REGEX.test(value);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser("admin");
  if ("error" in auth) return auth.error;

  const { id } = await params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "Invalid contact id" }, { status: 400 });
  }

  const body = await request.json();
  const dueAt = typeof body.due_at === "string" ? body.due_at : "";
  const channel = typeof body.channel === "string" ? body.channel.trim().toLowerCase() : "";
  const purpose = typeof body.purpose === "string" ? body.purpose.trim() : "";
  const assignedTo = typeof body.assigned_to === "string" ? body.assigned_to.trim() : "";

  if (!dueAt || !purpose || !channel) {
    return NextResponse.json({ error: "due_at, channel, and purpose are required" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });
  const parsedDueAt = new Date(dueAt);
  if (Number.isNaN(parsedDueAt.getTime())) {
    return NextResponse.json({ error: "Invalid due_at datetime" }, { status: 400 });
  }

  if (assignedTo && !isUuid(assignedTo)) {
    return NextResponse.json({ error: "Invalid assigned_to user id" }, { status: 400 });
  }

  const { data: contact, error: contactError } = await admin.data.from("crm_contacts").select("id").eq("id", id).eq("is_deleted", false).maybeSingle();
  if (contactError) return NextResponse.json({ error: contactError.message }, { status: 500 });
  if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });

  if (assignedTo) {
    const { data: assignee, error: assigneeError } = await admin.data
      .from("profiles")
      .select("id,role")
      .eq("id", assignedTo)
      .maybeSingle<{ id: string; role: string }>();

    if (assigneeError || !assignee || assignee.role !== "admin") {
      return NextResponse.json({ error: "assigned_to must be an existing admin user id" }, { status: 400 });
    }
  }

  const { data, error } = await admin.data
    .from("crm_follow_ups")
    .insert({
      contact_id: id,
      due_at: dueAt,
      channel,
      purpose,
      assigned_to: assignedTo || auth.user.id,
      status: "pending",
      created_by: auth.user.id,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await admin.data.from("crm_contacts").update({ next_follow_up_at: dueAt }).eq("id", id);

  await createCrmActivity({
    contactId: id,
    adminUserId: auth.user.id,
    activityType: "follow_up_created",
    title: "Follow-up scheduled",
    description: `${channel} · ${purpose}`,
    metadata: { followUpId: data.id, dueAt, channel, purpose },
  });

  await writeAdminAuditLog({
    adminUserId: auth.user.id,
    action: "CRM_FOLLOW_UP_CREATED",
    targetTable: "crm_follow_ups",
    targetId: data.id,
    metadata: { contactId: id, dueAt, channel, purpose },
  });

  return NextResponse.json({ followUp: data });
}
