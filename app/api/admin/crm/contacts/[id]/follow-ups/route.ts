import { NextResponse } from "next/server";

import { createCrmActivity } from "@/lib/admin/crm";
import { writeAdminAuditLog } from "@/lib/admin/audit-log";
import { requireApiUser } from "@/lib/auth/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser("admin");
  if ("error" in auth) return auth.error;

  const { id } = await params;
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
