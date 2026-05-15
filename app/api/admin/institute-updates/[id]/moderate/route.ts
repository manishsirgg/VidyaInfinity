import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser("admin");
  if ("error" in auth) return auth.error;
  const admin = getSupabaseAdmin(); if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });
  const { id } = await params;
  const body = await request.json() as { action?: string; rejectionReason?: string };
  const now = new Date().toISOString();
  const action = body.action;
  let payload: Record<string, unknown> | null = null;
  if (action === "approve") payload = { status: "approved", approved_by: auth.user.id, approved_at: now, published_at: now, rejection_reason: null, rejected_by: null, rejected_at: null, hidden_by: null, hidden_at: null, deleted_at: null };
  if (action === "reject") {
    const reason = String(body.rejectionReason ?? "").trim(); if (!reason) return NextResponse.json({ error: "Rejection reason is required." }, { status: 400 });
    payload = { status: "rejected", rejected_by: auth.user.id, rejected_at: now, rejection_reason: reason, approved_by: null, approved_at: null, published_at: null };
  }
  if (action === "hide") payload = { status: "hidden", hidden_by: auth.user.id, hidden_at: now };
  if (action === "restore") payload = { status: "approved", hidden_by: null, hidden_at: null, deleted_at: null };
  if (action === "delete") payload = { status: "deleted", deleted_at: now };
  if (!payload) return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  const { error } = await admin.data.from("institute_updates").update(payload).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
