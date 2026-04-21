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
  const tagId = typeof body.tag_id === "string" ? body.tag_id.trim() : "";

  if (!tagId) return NextResponse.json({ error: "tag_id is required" }, { status: 400 });
  if (!isUuid(tagId)) return NextResponse.json({ error: "Invalid tag_id" }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });
  const [{ data: contact }, { data: tag }, { data: existingTag }] = await Promise.all([
    admin.data.from("crm_contacts").select("id").eq("id", id).maybeSingle(),
    admin.data.from("crm_tags").select("id").eq("id", tagId).maybeSingle(),
    admin.data.from("crm_contact_tags").select("id").eq("contact_id", id).eq("tag_id", tagId).maybeSingle(),
  ]);

  if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  if (!tag) return NextResponse.json({ error: "Tag not found" }, { status: 404 });
  if (existingTag) return NextResponse.json({ error: "Tag already attached to contact" }, { status: 409 });

  const { data, error } = await admin.data
    .from("crm_contact_tags")
    .insert({ contact_id: id, tag_id: tagId, created_by: auth.user.id })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await createCrmActivity({
    contactId: id,
    adminUserId: auth.user.id,
    activityType: "tags_updated",
    title: "Tag attached",
    metadata: { tagId },
  });

  await writeAdminAuditLog({
    adminUserId: auth.user.id,
    action: "CRM_TAG_ATTACHED",
    targetTable: "crm_contact_tags",
    targetId: data.id,
    metadata: { contactId: id, tagId },
  });

  return NextResponse.json({ contactTag: data });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser("admin");
  if ("error" in auth) return auth.error;

  const { id } = await params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "Invalid contact id" }, { status: 400 });
  }

  const url = new URL(request.url);
  const tagId = url.searchParams.get("tagId")?.trim() ?? "";

  if (!tagId) return NextResponse.json({ error: "tagId is required" }, { status: 400 });
  if (!isUuid(tagId)) return NextResponse.json({ error: "Invalid tagId" }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });
  const { data: existingTagRow } = await admin.data
    .from("crm_contact_tags")
    .select("id")
    .eq("contact_id", id)
    .eq("tag_id", tagId)
    .maybeSingle();

  if (!existingTagRow) return NextResponse.json({ error: "Tag is not attached to this contact" }, { status: 404 });

  const { error } = await admin.data.from("crm_contact_tags").delete().eq("contact_id", id).eq("tag_id", tagId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await createCrmActivity({
    contactId: id,
    adminUserId: auth.user.id,
    activityType: "tags_updated",
    title: "Tag removed",
    metadata: { tagId },
  });

  await writeAdminAuditLog({
    adminUserId: auth.user.id,
    action: "CRM_TAG_REMOVED",
    targetTable: "crm_contact_tags",
    targetId: id,
    metadata: { contactId: id, tagId },
  });

  return NextResponse.json({ ok: true });
}
