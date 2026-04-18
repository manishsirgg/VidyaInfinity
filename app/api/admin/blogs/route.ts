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

export async function GET() {
  const auth = await requireApiUser("admin");
  if ("error" in auth) return auth.error;

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const { data, error } = await admin.data
    .from("blogs")
    .select("id,title,slug,excerpt,status,published_at,created_at,updated_at")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ blogs: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireApiUser("admin");
  if ("error" in auth) return auth.error;

  const body = await request.json();
  const title = String(body.title ?? "").trim();
  const content = String(body.content ?? "").trim();
  const excerpt = String(body.excerpt ?? "").trim();
  const slug = String(body.slug ?? "").trim() || toSlug(title);
  const status = String(body.status ?? "draft").trim().toLowerCase();

  if (!title || !content || !excerpt) {
    return NextResponse.json({ error: "title, excerpt and content are required" }, { status: 400 });
  }

  if (!slug) {
    return NextResponse.json({ error: "Unable to generate slug" }, { status: 400 });
  }

  if (!["draft", "published", "archived"].includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const publishedAt = status === "published" ? new Date().toISOString() : null;

  const { data, error } = await admin.data
    .from("blogs")
    .insert({
      title,
      slug,
      excerpt,
      content,
      status,
      published_at: publishedAt,
      author_id: auth.user.id,
      updated_by: auth.user.id,
    })
    .select("id,title,slug,status,published_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAdminAuditLog({
    adminUserId: auth.user.id,
    action: "BLOG_CREATED",
    targetTable: "blogs",
    targetId: data.id,
    metadata: { title: data.title, status: data.status, slug: data.slug },
  });

  return NextResponse.json({ ok: true, blog: data });
}
