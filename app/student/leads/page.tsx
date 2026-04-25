import Link from "next/link";

import { requireUser } from "@/lib/auth/get-session";
import { getStudentInquiries } from "@/lib/leads/student-inquiries";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function formatDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

export default async function StudentInquiriesPage() {
  const { user, profile } = await requireUser("student", { requireApproved: false });
  const fallbackClient = await createClient();
  const admin = getSupabaseAdmin();
  const dataClient = admin.ok ? admin.data : fallbackClient;
  const inquiries = await getStudentInquiries(dataClient, {
    userId: user.id,
    email: profile.email ?? null,
    phone: null,
    limit: 200,
  });

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

      <div className="mt-6 rounded-xl border border-brand-100 bg-gradient-to-r from-brand-50 via-white to-white p-4 text-sm text-slate-700 shadow-sm">
        <p className="font-semibold text-slate-900">Live inquiry sync enabled</p>
        <p className="mt-1">
          Every lead submitted from course or webinar pages is auto-linked to your account by login, email, and phone. If you just submitted one,
          refresh this page and it will appear here.
        </p>
      </div>

      <div className="mt-4 space-y-3">
        {(inquiries ?? []).length === 0 ? (
          <div className="rounded-xl border bg-white p-4 text-sm text-slate-600">
            You have not sent any course inquiries yet. Explore courses and submit an inquiry to get started.
          </div>
        ) : null}

        {(inquiries ?? []).map((inquiry) => (
          <div key={inquiry.id} className="rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-sm transition hover:border-brand-300">
            <p className="font-medium text-slate-900">{inquiry.full_name ?? inquiry.name ?? "Student inquiry"}</p>
            <p className="mt-1 text-slate-700">
              {inquiry.email ?? "No email"} · {inquiry.phone ?? "No phone"}
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
