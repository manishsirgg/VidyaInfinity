import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api-auth";
import { EDITABLE_STATUSES, sanitizeContent } from "@/lib/institute-updates";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser("institute", { requireApproved: false });
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const admin = getSupabaseAdmin(); if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });
  const { data: institute } = await admin.data.from("institutes").select("id").eq("user_id", auth.user.id).maybeSingle<{id:string}>();
  if (!institute) return NextResponse.json({ error: "Institute record not found" }, { status: 404 });
  const { data: existing } = await admin.data.from("institute_updates").select("id,status").eq("id", id).eq("institute_id", institute.id).maybeSingle<{id:string;status:string}>();
  if (!existing) return NextResponse.json({ error: "Update not found" }, { status: 404 });
  if (!EDITABLE_STATUSES.has(existing.status)) return NextResponse.json({ error: "This update is read-only." }, { status: 400 });
  const body = await request.json();
  const content = sanitizeContent(body.content);
  const updates: Record<string, unknown> = { content, updated_at: new Date().toISOString() };
  if (existing.status === "rejected" || body.resubmit === true) {
    updates.status = "pending_review"; updates.rejection_reason = null; updates.rejected_by = null; updates.rejected_at = null;
  }
  const { error } = await admin.data.from("institute_updates").update(updates).eq("id", id).eq("institute_id", institute.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser("institute", { requireApproved: false });
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const admin = getSupabaseAdmin(); if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });
  const { data: institute } = await admin.data.from("institutes").select("id").eq("user_id", auth.user.id).maybeSingle<{id:string}>();
  if (!institute) return NextResponse.json({ error: "Institute record not found" }, { status: 404 });
  const { data: existing } = await admin.data.from("institute_updates").select("status").eq("id", id).eq("institute_id", institute.id).maybeSingle<{status:string}>();
  if (!existing) return NextResponse.json({ error: "Update not found" }, { status: 404 });
  if (!EDITABLE_STATUSES.has(existing.status)) return NextResponse.json({ error: "Cannot delete this update." }, { status: 400 });
  const { error } = await admin.data.from("institute_updates").update({ status: "deleted", deleted_at: new Date().toISOString() }).eq("id", id).eq("institute_id", institute.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
