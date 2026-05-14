import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { CRM_CONTACT_PRIORITIES, CRM_CONTACT_STAGES } from "@/lib/institute/crm-enums";

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
  linked_institute_id: string | null;
  conversion_status: string | null;
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
  const convertedOnly = params.get("converted") === "true";
  const instituteId = params.get("instituteId")?.trim() ?? "";
  const sort = params.get("sort") ?? "newest";


  if (stage && !CRM_CONTACT_STAGES.includes(stage as (typeof CRM_CONTACT_STAGES)[number])) {
    return NextResponse.json({ error: "Invalid contact stage" }, { status: 400 });
  }

  if (priority && !CRM_CONTACT_PRIORITIES.includes(priority as (typeof CRM_CONTACT_PRIORITIES)[number])) {
    return NextResponse.json({ error: "Invalid contact priority" }, { status: 400 });
  }

  const rangeFrom = (page - 1) * pageSize;
  const rangeTo = rangeFrom + pageSize - 1;

  let query = admin.data.from("crm_contacts").select("*", { count: "exact" }).eq("is_deleted", false).eq("is_archived", false);

  if (search) {
    const escaped = search.replaceAll(",", " ");
    query = query.or(`full_name.ilike.%${escaped}%,email.ilike.%${escaped}%,phone.ilike.%${escaped}%`);
  }

  if (stage) query = query.eq("lifecycle_stage", stage);
  if (priority) query = query.eq("priority", priority);
  if (source) query = query.eq("source", source);
  if (serviceType) query = query.eq("service_type", serviceType);
  if (assignedTo) query = query.eq("assigned_to", assignedTo);
  if (instituteId) query = query.eq("linked_institute_id", instituteId);
  if (convertedOnly) query = query.eq("lifecycle_stage", "converted");

  if (overdueOnly) {
    query = query.lt("next_follow_up_at", new Date().toISOString());
  }

  if (sort === "last_activity") query = query.order("last_activity_at", { ascending: false, nullsFirst: false });
  else if (sort === "next_follow_up") query = query.order("next_follow_up_at", { ascending: true, nullsFirst: false });
  else query = query.order("created_at", { ascending: false });

  const { data, count, error } = await query.range(rangeFrom, rangeTo).returns<CrmContactRow[]>();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const nowIso = new Date().toISOString();
  const [
    totalContacts,
    newContacts,
    convertedContacts,
    highPriorityContacts,
    overdueFollowUpsCountResp,
    sourceBreakdownResp,
    serviceBreakdownResp,
    instituteBreakdownResp,
    recentConversionsResp,
  ] = await Promise.all([
    admin.data.from("crm_contacts").select("id", { count: "exact", head: true }).eq("is_deleted", false).eq("is_archived", false),
    admin.data.from("crm_contacts").select("id", { count: "exact", head: true }).eq("is_deleted", false).eq("is_archived", false).eq("lifecycle_stage", "new"),
    admin.data.from("crm_contacts").select("id", { count: "exact", head: true }).eq("is_deleted", false).eq("is_archived", false).or("converted.eq.true,lifecycle_stage.eq.converted"),
    admin.data.from("crm_contacts").select("id", { count: "exact", head: true }).eq("is_deleted", false).eq("is_archived", false).in("priority", ["high", "urgent"]),
    admin.data
      .from("crm_follow_ups")
      .select("id", { count: "exact", head: true })
      .eq("status", "scheduled")
      .eq("is_deleted", false)
      .lt("due_at", nowIso),
    admin.data.from("crm_contacts").select("source").eq("is_deleted", false).eq("is_archived", false),
    admin.data.from("crm_contacts").select("service_type").eq("is_deleted", false).eq("is_archived", false),
    admin.data.from("institutes").select("id,name"),
    admin.data.from("crm_activities").select("id,contact_id,title,activity_type,created_at").in("activity_type", ["course_purchased", "webinar_purchased", "course_enrolled", "converted"]).order("created_at", { ascending: false }).limit(10),
  ]);

  if (overdueFollowUpsCountResp.error) {
    console.error("[admin-crm] overdue follow-ups count failed", { message: overdueFollowUpsCountResp.error.message });
  }
  const overdueFollowUps = overdueFollowUpsCountResp.error ? null : overdueFollowUpsCountResp.count ?? 0;
  const totalContactsCount = totalContacts.error ? null : totalContacts.count ?? 0;
  const newContactsCount = newContacts.error ? null : newContacts.count ?? 0;
  const convertedContactsCount = convertedContacts.error ? null : convertedContacts.count ?? 0;
  const highPriorityContactsCount = highPriorityContacts.error ? null : highPriorityContacts.count ?? 0;
  if (totalContacts.error) console.error("[admin-crm] total contacts count failed", { message: totalContacts.error.message });
  if (newContacts.error) console.error("[admin-crm] new contacts count failed", { message: newContacts.error.message });
  if (convertedContacts.error) console.error("[admin-crm] converted contacts count failed", { message: convertedContacts.error.message });
  if (highPriorityContacts.error) console.error("[admin-crm] high priority contacts count failed", { message: highPriorityContacts.error.message });

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
  const instituteRows = (
    await admin.data.from("crm_contacts").select("linked_institute_id").eq("is_deleted", false).eq("is_archived", false)
  ).data ?? [];
  const instituteCounts = instituteRows.reduce<Record<string, number>>((acc, row) => {
    if (!row.linked_institute_id) return acc;
    acc[row.linked_institute_id] = (acc[row.linked_institute_id] ?? 0) + 1;
    return acc;
  }, {});
  const instituteNameMap = new Map((instituteBreakdownResp.data ?? []).map((institute) => [institute.id, institute.name ?? institute.id]));
  const labeledInstituteCounts = Object.fromEntries(Object.entries(instituteCounts).map(([id, count]) => [id, instituteNameMap.get(id) ?? `${id.slice(0, 8)}… (${count})`]));

  return NextResponse.json({
    data: data ?? [],
    page,
    pageSize,
    total: count ?? 0,
    kpis: {
      totalContacts: totalContactsCount,
      newContacts: newContactsCount,
      converted: convertedContactsCount,
      convertedContacts: convertedContactsCount,
      highPriorityContacts: highPriorityContactsCount,
      overdueFollowUps,
      recentConversions: recentConversionsResp.data?.length ?? 0,
      sourceCounts,
      serviceTypeCounts,
      instituteCounts: labeledInstituteCounts,
    },
    recentConversionsList: recentConversionsResp.data ?? [],
  });
}
