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
  const note = typeof body.note === "string" ? body.note.trim() : "";
  const pinned = Boolean(body.is_pinned);

  if (!note) {
    return NextResponse.json({ error: "note is required" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const { data, error } = await admin.data
    .from("crm_notes")
    .insert({ contact_id: id, note, is_pinned: pinned, created_by: auth.user.id })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await createCrmActivity({
    contactId: id,
    adminUserId: auth.user.id,
    activityType: "note_added",
    title: pinned ? "Pinned note added" : "Note added",
    description: note.slice(0, 120),
    metadata: { noteId: data.id, pinned },
  });

  await writeAdminAuditLog({
    adminUserId: auth.user.id,
    action: "CRM_NOTE_CREATED",
    targetTable: "crm_notes",
    targetId: data.id,
    metadata: { contactId: id, pinned },
  });

  return NextResponse.json({ note: data });
}
