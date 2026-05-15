import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type InstituteCourseMedia = {
  id: string;
  file_url: string;
  type: string;
  storage_path?: string | null;
};

export type InstituteCourseRecord = {
  id: string;
  institute_id: string;
  title: string;
  summary: string | null;
  description: string | null;
  category: string | null;
  subject: string | null;
  level: string | null;
  language: string | null;
  fees: number;
  duration: string;
  duration_value: number | null;
  duration_unit: string | null;
  mode: string;
  location: string | null;
  schedule: string | null;
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
  syllabus_text: string | null;
  syllabus_file_name: string | null;
  syllabus_file_path: string | null;
  status: string;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
  deleted_at: string | null;
};

const COURSE_SELECT = "id,institute_id,title,summary,description,category,subject,level,language,fees,duration,duration_value,duration_unit,mode,location,schedule,start_date,end_date,admission_deadline,eligibility,learning_outcomes,target_audience,certificate_status,certificate_details,batch_size,placement_support,internship_support,faculty_name,faculty_qualification,support_email,support_phone,syllabus_text,syllabus_file_name,syllabus_file_path,status,rejection_reason,created_at,updated_at,is_deleted,deleted_at";

export async function getInstituteDataClient() {
  const supabase = await createClient();
  const admin = getSupabaseAdmin();
  return admin.ok ? admin.data : supabase;
}

export async function getInstituteIdByUserId(userId: string): Promise<string | null> {
  const dataClient = await getInstituteDataClient();
  const { data } = await dataClient.from("institutes").select("id").eq("user_id", userId).maybeSingle<{ id: string }>();
  return data?.id ?? null;
}

export async function listInstituteCourses(userId: string, options?: { includeArchived?: boolean }) {
  const instituteId = await getInstituteIdByUserId(userId);
  if (!instituteId) return [] as InstituteCourseRecord[];

  const dataClient = await getInstituteDataClient();
  let query = dataClient
    .from("courses")
    .select(COURSE_SELECT)
    .eq("institute_id", instituteId)
    .order("created_at", { ascending: false });

  if (!options?.includeArchived) query = query.eq("is_deleted", false);

  const { data } = await query;

  return (data ?? []) as InstituteCourseRecord[];
}

export async function getInstituteCourseById(userId: string, courseId: string) {
  const instituteId = await getInstituteIdByUserId(userId);
  if (!instituteId) return null;

  const dataClient = await getInstituteDataClient();
  const { data: course } = await dataClient
    .from("courses")
    .select(COURSE_SELECT)
    .eq("id", courseId)
    .eq("institute_id", instituteId)
    .eq("is_deleted", false)
    .maybeSingle();

  if (!course) return null;

  const { data: mediaWithPath } = await dataClient
    .from("course_media")
    .select("id,file_url,type,storage_path")
    .eq("course_id", courseId)
    .order("id", { ascending: true });

  if (mediaWithPath) {
    return {
      course: course as InstituteCourseRecord,
      media: mediaWithPath as InstituteCourseMedia[],
    };
  }

  const { data: mediaWithoutPath } = await dataClient
    .from("course_media")
    .select("id,file_url,type")
    .eq("course_id", courseId)
    .order("id", { ascending: true });

  return {
    course: course as InstituteCourseRecord,
    media: ((mediaWithoutPath ?? []) as Array<{ id: string; file_url: string; type: string }>).map((item) => ({ ...item, storage_path: null })),
  };
}
