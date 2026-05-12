import { NextResponse } from "next/server";
import { requireInstituteApiContext } from "@/lib/institute/crm";

export async function GET() {
  const ctx = await requireInstituteApiContext();
  if ("error" in ctx) return ctx.error;
  const { admin, instituteId } = ctx;

  const [contactsResp, followResp, actResp] = await Promise.all([
    admin
      .from("crm_contacts")
      .select("id,lifecycle_stage,priority,course_id,webinar_id,is_archived,converted")
      .eq("owner_type", "institute")
      .eq("owner_institute_id", instituteId)
      .eq("is_deleted", false)
      .eq("is_archived", false),
    admin.from("crm_follow_ups").select("id,due_at,status").eq("institute_id", instituteId).eq("is_deleted", false),
    admin.from("crm_activities").select("id,created_at,title,activity_type,description,contact_id").eq("institute_id", instituteId).order("created_at", { ascending: false }).limit(10),
  ]);
  if (contactsResp.error || followResp.error || actResp.error) return NextResponse.json({ error: contactsResp.error?.message ?? followResp.error?.message ?? actResp.error?.message }, { status: 500 });

  const contacts = contactsResp.data ?? [];
  const followUps = followResp.data ?? [];
  const now = new Date();
  const isToday = (d: Date) => d.toDateString() === now.toDateString();

  return NextResponse.json({
    metrics: {
      totalContacts: contacts.filter((c) => !c.is_archived).length,
      newLeads: contacts.filter((c) => c.lifecycle_stage === "new" && !c.is_archived).length,
      contacted: contacts.filter((c) => c.lifecycle_stage === "contacted" && !c.is_archived).length,
      converted: contacts.filter((c) => c.converted || c.lifecycle_stage === "converted").length,
      lostOrArchived: contacts.filter((c) => c.lifecycle_stage === "lost" || c.is_archived).length,
      highPriority: contacts.filter((c) => c.priority === "high" || c.priority === "urgent").length,
      courseLeads: contacts.filter((c) => c.course_id).length,
      webinarLeads: contacts.filter((c) => c.webinar_id).length,
      dueToday: followUps.filter((f) => f.status === "pending" && f.due_at && isToday(new Date(f.due_at))).length,
      overdue: followUps.filter((f) => f.status === "pending" && f.due_at && new Date(f.due_at) < now).length,
    },
    recentActivities: actResp.data ?? [],
    upcomingFollowUps: followUps.filter((f) => f.status === "pending" && f.due_at && new Date(f.due_at) >= now).sort((a, b) => new Date(a.due_at!).getTime() - new Date(b.due_at!).getTime()).slice(0, 10),
  });
}
