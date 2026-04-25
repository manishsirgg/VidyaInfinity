import Link from "next/link";

import { requireUser } from "@/lib/auth/get-session";
import { createClient } from "@/lib/supabase/server";

function formatDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

export default async function StudentInquiriesPage() {
  const { user, profile } = await requireUser("student", { requireApproved: false });
  const supabase = await createClient();

  const { data: inquiriesByStudentId } = await supabase
    .from("leads")
    .select("id,name,email,phone,lead_type,course_id,webinar_id,message,created_at")
    .eq("student_id", user.id)
    .order("created_at", { ascending: false });

  const shouldLoadLegacyByEmail = (inquiriesByStudentId?.length ?? 0) === 0 && Boolean(profile.email);
  const { data: inquiriesByEmail } = shouldLoadLegacyByEmail
    ? await supabase
        .from("leads")
        .select("id,name,email,phone,lead_type,course_id,webinar_id,message,created_at")
        .is("student_id", null)
        .eq("email", profile.email)
        .order("created_at", { ascending: false })
    : { data: [] as typeof inquiriesByStudentId };

  const inquiries = [...(inquiriesByStudentId ?? []), ...(inquiriesByEmail ?? [])];

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">My Inquiries</h1>
          <p className="mt-1 text-sm text-slate-600">Track your course inquiries and submissions in one place.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/student/dashboard" className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-700">
            Back to Dashboard
          </Link>
          <Link href="/courses" className="rounded bg-brand-600 px-3 py-2 text-sm text-white">
            Browse Courses
          </Link>
        </div>
      </div>

      <div className="mt-6 space-y-2">
        {(inquiries ?? []).length === 0 ? (
          <div className="rounded-xl border bg-white p-4 text-sm text-slate-600">
            You have not sent any course inquiries yet. Explore courses and submit an inquiry to get started.
          </div>
        ) : null}

        {(inquiries ?? []).map((inquiry) => (
          <div key={inquiry.id} className="rounded-xl border bg-white p-4 text-sm">
            <p className="font-medium text-slate-900">{inquiry.name}</p>
            <p className="mt-1 text-slate-700">
              {inquiry.email} · {inquiry.phone}
            </p>
            <p className="mt-1 text-slate-700">
              {inquiry.lead_type === "webinar" ? "Webinar ID" : "Course ID"}: {inquiry.webinar_id ?? inquiry.course_id ?? "N/A"}
            </p>
            {inquiry.message ? <p className="mt-2 text-slate-700">{inquiry.message}</p> : null}
            <p className="mt-2 text-xs text-slate-500">Submitted: {formatDate(inquiry.created_at)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
