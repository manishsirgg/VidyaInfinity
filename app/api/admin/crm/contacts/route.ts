import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type CrmContactRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  service_type: string | null;
  lifecycle_stage: string | null;
  priority: string | null;
  assigned_to: string | null;
  next_follow_up_at: string | null;
  last_activity_at: string | null;
  created_at: string | null;
};

export async function GET(request: Request) {
  const auth = await requireApiUser("admin");
  if ("error" in auth) return auth.error;

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const url = new URL(request.url);
  const params = url.searchParams;

  const page = Math.max(1, Number(params.get("page") ?? "1"));
  const pageSize = Math.min(100, Math.max(10, Number(params.get("pageSize") ?? "20")));
  const search = params.get("search")?.trim() ?? "";
  const stage = params.get("stage")?.trim() ?? "";
  const priority = params.get("priority")?.trim() ?? "";
  const source = params.get("source")?.trim() ?? "";
  const serviceType = params.get("serviceType")?.trim() ?? "";
  const assignedTo = params.get("assignedTo")?.trim() ?? "";
  const overdueOnly = params.get("overdue") === "true";
  const sort = params.get("sort") ?? "newest";

  const rangeFrom = (page - 1) * pageSize;
  const rangeTo = rangeFrom + pageSize - 1;

  let query = admin.data.from("crm_contacts").select("*", { count: "exact" }).eq("is_deleted", false);

  if (search) {
    const escaped = search.replaceAll(",", " ");
    query = query.or(`full_name.ilike.%${escaped}%,email.ilike.%${escaped}%,phone.ilike.%${escaped}%`);
  }

  if (stage) query = query.eq("lifecycle_stage", stage);
  if (priority) query = query.eq("priority", priority);
  if (source) query = query.eq("source", source);
  if (serviceType) query = query.eq("service_type", serviceType);
  if (assignedTo) query = query.eq("assigned_to", assignedTo);

  if (overdueOnly) {
    query = query.lt("next_follow_up_at", new Date().toISOString());
  }

  if (sort === "last_activity") query = query.order("last_activity_at", { ascending: false, nullsFirst: false });
  else if (sort === "next_follow_up") query = query.order("next_follow_up_at", { ascending: true, nullsFirst: false });
  else query = query.order("created_at", { ascending: false });

  const { data, count, error } = await query.range(rangeFrom, rangeTo).returns<CrmContactRow[]>();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const [kpiResp, sourceBreakdownResp, serviceBreakdownResp] = await Promise.all([
    admin.data.from("crm_contacts").select("lifecycle_stage,next_follow_up_at").eq("is_deleted", false),
    admin.data.from("crm_contacts").select("source").eq("is_deleted", false),
    admin.data.from("crm_contacts").select("service_type").eq("is_deleted", false),
  ]);

  const rows = kpiResp.data ?? [];
  const now = new Date();
  const dueToday = rows.filter((row) => {
    if (!row.next_follow_up_at) return false;
    const followUpDate = new Date(row.next_follow_up_at);
    return followUpDate.toDateString() === now.toDateString();
  }).length;

  const overdueFollowUps = rows.filter((row) => {
    if (!row.next_follow_up_at) return false;
    return new Date(row.next_follow_up_at) < now;
  }).length;

  const lifecycleCounts = rows.reduce<Record<string, number>>((acc, row) => {
    const key = row.lifecycle_stage ?? "unknown";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const sourceCounts = (sourceBreakdownResp.data ?? []).reduce<Record<string, number>>((acc, row) => {
    const key = row.source ?? "unknown";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const serviceTypeCounts = (serviceBreakdownResp.data ?? []).reduce<Record<string, number>>((acc, row) => {
    const key = row.service_type ?? "unknown";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  return NextResponse.json({
    data: data ?? [],
    page,
    pageSize,
    total: count ?? 0,
    kpis: {
      totalContacts: rows.length,
      newContacts: lifecycleCounts.new ?? 0,
      contacted: lifecycleCounts.contacted ?? 0,
      qualified: lifecycleCounts.qualified ?? 0,
      converted: lifecycleCounts.converted ?? 0,
      overdueFollowUps,
      followUpsDueToday: dueToday,
      sourceCounts,
      serviceTypeCounts,
    },
  });
}
