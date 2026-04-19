import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type InstituteCourseRecord = {
  id: string;
  title: string;
  summary: string | null;
  description: string | null;
  category: string | null;
  subject: string | null;
  level: string | null;
  language: string | null;
  mode: string | null;
  duration: string | null;
  duration_value: number | null;
  duration_unit: string | null;
  schedule: string | null;
  location: string | null;
  start_date: string | null;
  end_date: string | null;
  admission_deadline: string | null;
  eligibility: string | null;
  learning_outcomes: string | null;
  target_audience: string | null;
  certificate_status: string | null;
  certificate_details: string | null;
  batch_size: number | null;
  placement_support: boolean | null;
  internship_support: boolean | null;
  faculty_name: string | null;
  faculty_qualification: string | null;
  support_email: string | null;
  support_phone: string | null;
  fees: number;
  status: string;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type InstituteCourseWithMedia = InstituteCourseRecord & {
  course_media: Array<{
    id: string;
    file_url: string;
    type: "image" | "video";
    storage_path: string | null;
  }>;
};

const COURSE_SELECT = "id,title,summary,description,category,subject,level,language,mode,duration,duration_value,duration_unit,schedule,location,start_date,end_date,admission_deadline,eligibility,learning_outcomes,target_audience,certificate_status,certificate_details,batch_size,placement_support,internship_support,faculty_name,faculty_qualification,support_email,support_phone,fees,status,rejection_reason,created_at,updated_at";
const COURSE_WITH_MEDIA_SELECT = `${COURSE_SELECT},course_media(id,file_url,type,storage_path)`;

export async function getInstituteCoursesByUserId(userId: string, status?: string) {
  const supabase = await createClient();
  const admin = getSupabaseAdmin();
  const dataClient = admin.ok ? admin.data : supabase;

  const { data: institute } = await dataClient.from("institutes").select("id").eq("user_id", userId).maybeSingle<{ id: string }>();
  if (!institute) return [] as InstituteCourseRecord[];

  let query = dataClient
    .from("courses")
    .select(COURSE_SELECT)
    .eq("institute_id", institute.id)
    .order("created_at", { ascending: false });

  if (status) query = query.eq("status", status);

  const { data } = await query;
  return (data ?? []) as InstituteCourseRecord[];
}

export async function getInstituteCourseById(userId: string, courseId: string) {
  const supabase = await createClient();
  const admin = getSupabaseAdmin();
  const dataClient = admin.ok ? admin.data : supabase;

  const { data: institute } = await dataClient.from("institutes").select("id").eq("user_id", userId).maybeSingle<{ id: string }>();
  if (!institute) return null;

  const { data } = await dataClient
    .from("courses")
    .select(COURSE_WITH_MEDIA_SELECT)
    .eq("id", courseId)
    .eq("institute_id", institute.id)
    .maybeSingle();

  return (data ?? null) as InstituteCourseWithMedia | null;
}
