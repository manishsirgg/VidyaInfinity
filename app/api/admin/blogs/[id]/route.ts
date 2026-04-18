import { NextResponse } from "next/server";

import { writeAdminAuditLog } from "@/lib/admin/audit-log";
import { requireApiUser } from "@/lib/auth/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

function toSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser("admin");
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const body = await request.json();

  const title = body.title ? String(body.title).trim() : undefined;
  const content = body.content ? String(body.content).trim() : undefined;
  const excerpt = body.excerpt ? String(body.excerpt).trim() : undefined;
  const status = body.status ? String(body.status).trim().toLowerCase() : undefined;
  const slugInput = body.slug ? String(body.slug).trim() : undefined;
  const slug = slugInput ? toSlug(slugInput) : title ? toSlug(title) : undefined;

  if (status && !["draft", "published", "archived"].includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updated_by: auth.user.id };

  if (title !== undefined) updates.title = title;
  if (content !== undefined) updates.content = content;
  if (excerpt !== undefined) updates.excerpt = excerpt;
  if (status !== undefined) updates.status = status;
  if (slug !== undefined) updates.slug = slug;

  if (status === "published") {
    updates.published_at = new Date().toISOString();
  }

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const { data, error } = await admin.data
    .from("blogs")
    .update(updates)
    .eq("id", id)
    .select("id,title,slug,status,published_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAdminAuditLog({
    adminUserId: auth.user.id,
    action: "BLOG_UPDATED",
    targetTable: "blogs",
    targetId: id,
    metadata: { title: data.title, status: data.status, slug: data.slug },
  });

  return NextResponse.json({ ok: true, blog: data });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser("admin");
  if ("error" in auth) return auth.error;

  const { id } = await params;

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const { error } = await admin.data.from("blogs").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAdminAuditLog({
    adminUserId: auth.user.id,
    action: "BLOG_DELETED",
    targetTable: "blogs",
    targetId: id,
  });

  return NextResponse.json({ ok: true });
}
