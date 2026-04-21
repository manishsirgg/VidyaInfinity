import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(undefined, { requireApproved: false });
  if ("error" in auth) return auth.error;

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const { id } = await params;
  const body = (await request.json()) as { action?: "mark_read" | "dismiss" | "archive" | "mark_unread" };
  const now = new Date().toISOString();

  const updates: Record<string, unknown> = {};
  if (body.action === "mark_read") {
    updates.is_read = true;
    updates.read_at = now;
  } else if (body.action === "mark_unread") {
    updates.is_read = false;
    updates.read_at = null;
  } else if (body.action === "dismiss") {
    updates.dismissed_at = now;
  } else if (body.action === "archive") {
    updates.archived_at = now;
  } else {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const { error } = await admin.data.from("notifications").update(updates).eq("id", id).eq("user_id", auth.user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
