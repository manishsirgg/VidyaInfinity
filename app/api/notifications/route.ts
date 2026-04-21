import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const auth = await requireApiUser(undefined, { requireApproved: false });
  if ("error" in auth) return auth.error;

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const url = new URL(request.url);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 30)));
  const unreadOnly = url.searchParams.get("unreadOnly") === "true";

  let query = admin.data
    .from("notifications")
    .select("id,title,message,type,category,priority,is_read,read_at,target_url,action_label,entity_type,entity_id,metadata,created_at,dismissed_at,archived_at,expires_at")
    .eq("user_id", auth.user.id)
    .is("dismissed_at", null)
    .is("archived_at", null)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (unreadOnly) query = query.eq("is_read", false);

  const [{ data, error }, { count, error: countError }] = await Promise.all([
    query,
    admin.data
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", auth.user.id)
      .eq("is_read", false)
      .is("dismissed_at", null)
      .is("archived_at", null)
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`),
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (countError) return NextResponse.json({ error: countError.message }, { status: 500 });

  return NextResponse.json({ notifications: data ?? [], unreadCount: count ?? 0 });
}

export async function PATCH(request: Request) {
  const auth = await requireApiUser(undefined, { requireApproved: false });
  if ("error" in auth) return auth.error;

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const body = (await request.json()) as { action?: "mark_all_read" | "archive_all" };
  const now = new Date().toISOString();

  if (body.action === "mark_all_read") {
    const { error } = await admin.data
      .from("notifications")
      .update({ is_read: true, read_at: now })
      .eq("user_id", auth.user.id)
      .eq("is_read", false)
      .is("dismissed_at", null)
      .is("archived_at", null);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "archive_all") {
    const { error } = await admin.data
      .from("notifications")
      .update({ archived_at: now })
      .eq("user_id", auth.user.id)
      .is("archived_at", null);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
