import { NextResponse } from "next/server";
import { requireInstituteApiContext } from "@/lib/institute/crm";

export async function GET(request: Request) {
  const ctx = await requireInstituteApiContext();
  if ("error" in ctx) return ctx.error;
  const { admin, instituteId } = ctx;

  const url = new URL(request.url);
  const p = url.searchParams;
  const page = Math.max(1, Number(p.get("page") ?? "1"));
  const pageSize = Math.min(100, Math.max(10, Number(p.get("pageSize") ?? "20")));
  const from = (page - 1) * pageSize;

  const archivedParam = p.get("archived");

  let q = admin
    .from("crm_contacts")
    .select(
      "id,full_name,email,phone,whatsapp_number,source,lifecycle_stage,priority,next_follow_up_at,last_activity_at,created_at,assigned_to,course_id,webinar_id,converted,is_archived,courses(title),webinars(title)",
      { count: "exact" },
    )
    .eq("owner_type", "institute")
    .eq("owner_institute_id", instituteId)
    .eq("is_deleted", false);

  if (!archivedParam) q = q.eq("is_archived", false);

  const search = p.get("search")?.trim(); if (search) q = q.or(`full_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%,whatsapp_number.ilike.%${search}%`);
  const pairs = [["lifecycle_stage","stage"],["priority","priority"],["course_id","courseId"],["webinar_id","webinarId"],["assigned_to","assignedTo"]] as const;
  for (const [col,key] of pairs) { const v = p.get(key)?.trim(); if (v) q = q.eq(col, v); }
  if (p.get("converted")) q = q.eq("converted", p.get("converted") === "true");
  if (archivedParam) q = q.eq("is_archived", archivedParam === "true");

  const due = p.get("due");
  const now = new Date();
  if (due === "overdue") q = q.lt("next_follow_up_at", now.toISOString());

  const { data, count, error } = await q.order("created_at", { ascending: false }).range(from, from + pageSize - 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const filtered = due === "today" ? (data ?? []).filter((r) => r.next_follow_up_at && new Date(r.next_follow_up_at).toDateString() === now.toDateString()) : data;
  return NextResponse.json({ data: filtered ?? [], total: count ?? 0, page, pageSize });
}
