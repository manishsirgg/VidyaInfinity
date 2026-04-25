import type { SupabaseClient } from "@supabase/supabase-js";

type LeadRow = {
  id: string;
  name: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  lead_type: string | null;
  course_id: string | null;
  webinar_id: string | null;
  message: string | null;
  created_at: string;
};

type StudentInquiryOptions = {
  userId: string;
  email?: string | null;
  phone?: string | null;
  limit?: number;
};

export async function getStudentInquiries(adminClient: SupabaseClient, options: StudentInquiryOptions): Promise<LeadRow[]> {
  const { userId, email, phone, limit = 100 } = options;

  const [byStudentIdResult, byEmailResult, byPhoneResult] = await Promise.all([
    adminClient
      .from("leads")
      .select("id,name,full_name,email,phone,lead_type,course_id,webinar_id,message,created_at")
      .eq("student_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit),
    email
      ? adminClient
          .from("leads")
          .select("id,name,full_name,email,phone,lead_type,course_id,webinar_id,message,created_at")
          .is("student_id", null)
          .ilike("email", email)
          .order("created_at", { ascending: false })
          .limit(limit)
      : Promise.resolve({ data: [] as LeadRow[], error: null }),
    phone
      ? adminClient
          .from("leads")
          .select("id,name,full_name,email,phone,lead_type,course_id,webinar_id,message,created_at")
          .is("student_id", null)
          .ilike("phone", phone)
          .order("created_at", { ascending: false })
          .limit(limit)
      : Promise.resolve({ data: [] as LeadRow[], error: null }),
  ]);

  const rows = [...(byStudentIdResult.data ?? []), ...(byEmailResult.data ?? []), ...(byPhoneResult.data ?? [])];
  const deduped = Array.from(new Map(rows.map((row) => [row.id, row])).values());
  deduped.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return deduped.slice(0, limit);
}
