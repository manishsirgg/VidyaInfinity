import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { CRM_ACTIVITY_TYPES, CRM_CONTACT_PRIORITIES, CRM_CONTACT_STAGES } from "@/lib/institute/crm-enums";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type CrmContactStage = (typeof CRM_CONTACT_STAGES)[number];
type CrmActivityType = (typeof CRM_ACTIVITY_TYPES)[number];
type CrmPriority = (typeof CRM_CONTACT_PRIORITIES)[number];

type ContactRow = {
  id: string;
  lifecycle_stage: CrmContactStage | null;
  metadata: Record<string, unknown> | null;
  linked_profile_id: string | null;
  lead_id: string | null;
  course_id: string | null;
  webinar_id: string | null;
};

const STAGE_RANK: Record<CrmContactStage, number> = {
  new: 1, contacted: 2, interested: 3, qualified: 4, application_started: 5, payment_pending: 6, converted: 7, lost: 8, junk: 9, archived: 10,
};

function mergeMetadata(existing: Record<string, unknown> | null | undefined, incoming: Record<string, unknown>) {
  return { ...(existing ?? {}), ...incoming, last_automation_at: new Date().toISOString() };
}

function pickStage(current: CrmContactStage | null, incoming: CrmContactStage, force = false): CrmContactStage {
  if (force || !current) return incoming;
  return STAGE_RANK[incoming] > STAGE_RANK[current] ? incoming : current;
}

async function findExistingContact(supabase: SupabaseClient, input: { instituteId: string; leadId?: string | null; studentId?: string | null; email?: string | null; phone?: string | null }) {
  if (input.leadId) {
    const byLeadId = await supabase.from("crm_contacts").select("id,lifecycle_stage,metadata,linked_profile_id,lead_id,course_id,webinar_id").eq("lead_id", input.leadId).maybeSingle<ContactRow>();
    if (byLeadId.data?.id) return byLeadId.data;
    const bySourceRef = await supabase.from("crm_contacts").select("id,lifecycle_stage,metadata,linked_profile_id,lead_id,course_id,webinar_id").eq("linked_institute_id", input.instituteId).eq("source_reference_table", "leads").eq("source_reference_id", input.leadId).maybeSingle<ContactRow>();
    if (bySourceRef.data?.id) return bySourceRef.data;
  }
  if (input.studentId) {
    const byProfile = await supabase.from("crm_contacts").select("id,lifecycle_stage,metadata,linked_profile_id,lead_id,course_id,webinar_id").eq("linked_institute_id", input.instituteId).eq("linked_profile_id", input.studentId).maybeSingle<ContactRow>();
    if (byProfile.data?.id) return byProfile.data;
  }
  if (input.email) {
    const byEmail = await supabase.from("crm_contacts").select("id,lifecycle_stage,metadata,linked_profile_id,lead_id,course_id,webinar_id").eq("linked_institute_id", input.instituteId).ilike("email", input.email).maybeSingle<ContactRow>();
    if (byEmail.data?.id) return byEmail.data;
  }
  if (input.phone) {
    const byPhone = await supabase.from("crm_contacts").select("id,lifecycle_stage,metadata,linked_profile_id,lead_id,course_id,webinar_id").eq("linked_institute_id", input.instituteId).or(`phone.eq.${input.phone},whatsapp_number.eq.${input.phone}`).maybeSingle<ContactRow>();
    if (byPhone.data?.id) return byPhone.data;
  }
  return null;
}

export async function upsertInstituteCrmContactFromLead(supabase: SupabaseClient, input: { instituteId: string; fullName: string; email?: string | null; phone?: string | null; whatsappNumber?: string | null; source?: string | null; leadId?: string | null; sourceReferenceTable?: string | null; sourceReferenceId?: string | null; serviceType?: string | null; lifecycleStage: CrmContactStage; priority?: CrmPriority; studentId?: string | null; courseId?: string | null; webinarId?: string | null; metadata?: Record<string, unknown>; forceStage?: boolean; }) {
  if (!input.instituteId || !input.fullName) return null;
  const existing = await findExistingContact(supabase, { instituteId: input.instituteId, leadId: input.leadId, studentId: input.studentId, email: input.email ?? null, phone: input.phone ?? null });

  if (existing?.id) {
    const nextMeta = mergeMetadata(existing.metadata, input.metadata ?? {});
    const patch: Record<string, unknown> = {
      last_activity_at: new Date().toISOString(),
      metadata: nextMeta,
      lifecycle_stage: pickStage(existing.lifecycle_stage, input.lifecycleStage, input.forceStage === true),
      linked_institute_id: input.instituteId,
      owner_type: "institute",
      owner_institute_id: input.instituteId,
    };
    if (!existing.linked_profile_id && input.studentId) patch.linked_profile_id = input.studentId;
    if (!existing.lead_id && input.leadId) patch.lead_id = input.leadId;
    if (!existing.course_id && input.courseId) patch.course_id = input.courseId;
    if (!existing.webinar_id && input.webinarId) patch.webinar_id = input.webinarId;
    await supabase.from("crm_contacts").update(patch).eq("id", existing.id);
    return { id: existing.id };
  }

  const { data } = await supabase.from("crm_contacts").insert({
    full_name: input.fullName,
    phone: input.phone ?? null,
    email: input.email ?? null,
    whatsapp_number: input.whatsappNumber ?? input.phone ?? null,
    source: input.source ?? null,
    source_reference_table: input.sourceReferenceTable ?? null,
    source_reference_id: input.sourceReferenceId ?? null,
    service_type: input.serviceType ?? null,
    lifecycle_stage: input.lifecycleStage,
    priority: input.priority ?? "medium",
    linked_profile_id: input.studentId ?? null,
    linked_institute_id: input.instituteId,
    owner_type: "institute",
    owner_institute_id: input.instituteId,
    lead_id: input.leadId ?? null,
    course_id: input.courseId ?? null,
    webinar_id: input.webinarId ?? null,
    metadata: mergeMetadata(null, input.metadata ?? {}),
    last_activity_at: new Date().toISOString(),
  }).select("id").maybeSingle<{id:string}>();
  return data ?? null;
}

export async function recordActivityIfMissing(supabase: SupabaseClient, input: { contactId: string; instituteId: string; actorUserId?: string | null; activityType: CrmActivityType; title: string; description?: string | null; dedupeKey: string; metadata?: Record<string, unknown>; }) {
  const { data: existing } = await supabase.from("crm_activities").select("id").eq("contact_id", input.contactId).eq("activity_type", input.activityType).eq("metadata->>dedupe_key", input.dedupeKey).limit(1).maybeSingle<{id:string}>();
  if (existing?.id) return;
  await supabase.from("crm_activities").insert({
    contact_id: input.contactId,
    institute_id: input.instituteId,
    actor_user_id: input.actorUserId ?? null,
    activity_type: input.activityType,
    title: input.title,
    description: input.description ?? null,
    metadata: { ...(input.metadata ?? {}), dedupe_key: input.dedupeKey },
  });
}

export async function safeRunCrmAutomation(label: string, fn: () => Promise<void>) {
  try { await fn(); } catch (error) { console.error(`[CRM automation] ${label} failed`, error); }
}

export async function markCourseOrderConvertedInCrm(input: { courseOrderId: string; razorpayOrderId?: string | null; razorpayPaymentId?: string | null; paidAt?: string | null; source?: string }) {
  const admin = getSupabaseAdmin();
  if (!admin.ok) throw new Error(admin.error);
  const supabase = admin.data;
  const { data: order, error: orderError } = await supabase
    .from("course_orders")
    .select("id,student_id,course_id,institute_id,payment_status,paid_at,gross_amount,razorpay_order_id,razorpay_payment_id")
    .eq("id", input.courseOrderId)
    .maybeSingle<{ id: string; student_id: string; course_id: string; institute_id: string; payment_status: string | null; paid_at: string | null; gross_amount: number | null; razorpay_order_id: string | null; razorpay_payment_id: string | null }>();
  if (orderError || !order) throw new Error(orderError?.message ?? "Course order not found");
  const [{ data: profile }, { data: enrollment }, { data: course }] = await Promise.all([
    supabase.from("profiles").select("full_name,email,phone").eq("id", order.student_id).maybeSingle<{ full_name: string | null; email: string | null; phone: string | null }>(),
    supabase.from("course_enrollments").select("id").eq("course_order_id", order.id).limit(1).maybeSingle<{ id: string }>(),
    supabase.from("courses").select("title").eq("id", order.course_id).maybeSingle<{ title: string | null }>(),
  ]);
  const contact = await upsertInstituteCrmContactFromLead(supabase, {
    instituteId: order.institute_id, fullName: profile?.full_name ?? "Student", email: profile?.email ?? null, phone: profile?.phone ?? null, serviceType: "course", source: "course_payment",
    lifecycleStage: "converted", forceStage: true, studentId: order.student_id, courseId: order.course_id,
    metadata: { course_order_id: order.id, enrollment_id: enrollment?.id ?? null, payment_status: "paid", automation_source: input.source ?? "payments/finalize-course" },
  });
  if (!contact?.id) return { contactId: null };
  const convertedAt = input.paidAt ?? order.paid_at ?? new Date().toISOString();
  await supabase.from("crm_contacts").update({
    converted: true, converted_at: convertedAt, lifecycle_stage: "converted", last_course_order_id: order.id, course_id: order.course_id, linked_profile_id: order.student_id, last_activity_at: new Date().toISOString(),
  }).eq("id", contact.id);
  await recordActivityIfMissing(supabase, {
    contactId: contact.id, instituteId: order.institute_id, actorUserId: order.student_id, activityType: "course_purchased", title: `Course purchased${course?.title ? `: ${course.title}` : ""}`, dedupeKey: `course_order:${order.id}`,
    metadata: { course_order_id: order.id, enrollment_id: enrollment?.id ?? null, payment_status: "paid", gross_amount: order.gross_amount, razorpay_order_id: input.razorpayOrderId ?? order.razorpay_order_id, razorpay_payment_id: input.razorpayPaymentId ?? order.razorpay_payment_id },
  });
  return { contactId: contact.id };
}

export async function markWebinarOrderConvertedInCrm(input: { webinarOrderId: string; razorpayOrderId?: string | null; razorpayPaymentId?: string | null; paidAt?: string | null; source?: string }) {
  const admin = getSupabaseAdmin();
  if (!admin.ok) throw new Error(admin.error);
  const supabase = admin.data;
  const { data: order, error: orderError } = await supabase
    .from("webinar_orders")
    .select("id,student_id,webinar_id,institute_id,payment_status,paid_at,amount,access_status,razorpay_order_id,razorpay_payment_id")
    .eq("id", input.webinarOrderId)
    .maybeSingle<{ id: string; student_id: string; webinar_id: string; institute_id: string; payment_status: string | null; paid_at: string | null; amount: number | null; access_status: string | null; razorpay_order_id: string | null; razorpay_payment_id: string | null }>();
  if (orderError || !order) throw new Error(orderError?.message ?? "Webinar order not found");
  const [{ data: profile }, { data: registration }, { data: webinar }] = await Promise.all([
    supabase.from("profiles").select("full_name,email,phone").eq("id", order.student_id).maybeSingle<{ full_name: string | null; email: string | null; phone: string | null }>(),
    supabase.from("webinar_registrations").select("id,payment_status,access_status").eq("webinar_order_id", order.id).limit(1).maybeSingle<{ id: string; payment_status: string | null; access_status: string | null }>(),
    supabase.from("webinars").select("title").eq("id", order.webinar_id).maybeSingle<{ title: string | null }>(),
  ]);
  const contact = await upsertInstituteCrmContactFromLead(supabase, {
    instituteId: order.institute_id, fullName: profile?.full_name ?? "Student", email: profile?.email ?? null, phone: profile?.phone ?? null, serviceType: "webinar", source: "webinar_payment",
    lifecycleStage: "converted", forceStage: true, studentId: order.student_id, webinarId: order.webinar_id,
    metadata: { webinar_order_id: order.id, registration_id: registration?.id ?? null, payment_status: registration?.payment_status ?? "paid", access_status: registration?.access_status ?? order.access_status, automation_source: input.source ?? "payments/finalize-webinar" },
  });
  if (!contact?.id) return { contactId: null };
  const convertedAt = input.paidAt ?? order.paid_at ?? new Date().toISOString();
  await supabase.from("crm_contacts").update({
    converted: true, converted_at: convertedAt, lifecycle_stage: "converted", last_webinar_order_id: order.id, webinar_id: order.webinar_id, linked_profile_id: order.student_id, last_activity_at: new Date().toISOString(),
  }).eq("id", contact.id);
  await recordActivityIfMissing(supabase, {
    contactId: contact.id, instituteId: order.institute_id, actorUserId: order.student_id, activityType: "webinar_purchased", title: `Webinar purchased${webinar?.title ? `: ${webinar.title}` : ""}`, dedupeKey: `webinar_order:${order.id}`,
    metadata: { webinar_order_id: order.id, registration_id: registration?.id ?? null, payment_status: registration?.payment_status ?? "paid", access_status: registration?.access_status ?? order.access_status, razorpay_order_id: input.razorpayOrderId ?? order.razorpay_order_id, razorpay_payment_id: input.razorpayPaymentId ?? order.razorpay_payment_id },
  });
  return { contactId: contact.id };
}
