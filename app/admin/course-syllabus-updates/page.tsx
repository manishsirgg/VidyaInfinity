import { requireUser } from "@/lib/auth/get-session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

async function moderate(formData: FormData) {
  "use server";
  await requireUser("admin");
  const id = String(formData.get("id") ?? "");
  const action = String(formData.get("action") ?? "");
  const rejectionReason = String(formData.get("rejectionReason") ?? "");
  await fetch(`${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/api/admin/course-syllabus-requests/${id}/moderate`, { method:"PATCH", headers:{"content-type":"application/json"}, body: JSON.stringify({ action, rejectionReason }) });
  revalidatePath("/admin/course-syllabus-updates");
}

export default async function Page({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireUser("admin");
  const { status } = await searchParams;
  const admin = getSupabaseAdmin(); if (!admin.ok) throw new Error(admin.error);
  let q = admin.data.from("course_syllabus_update_requests").select("id,status,created_at,rejection_reason,proposed_syllabus_text,proposed_file_path,proposed_file_name,course:courses(id,title,syllabus_text),institute:institutes(name)").order("created_at", { ascending:false });
  if (status) q = q.eq("status", status);
  const { data } = await q.limit(100);
  type RequestRow = { id: string; status: string; proposed_syllabus_text: string | null; proposed_file_path: string | null; proposed_file_name: string | null; rejection_reason: string | null; course: { title: string | null }[] | null; institute: { name: string | null }[] | null };
  const rows = (data ?? []) as RequestRow[];
  return <div className="vi-page"><h1 className="vi-page-title">Course Syllabus Updates</h1><div className="mt-4 flex gap-2">{["pending_review","approved","rejected","deleted"].map((s)=><a key={s} className="rounded border px-2 py-1 text-xs" href={`/admin/course-syllabus-updates?status=${s}`}>{s}</a>)}</div>
  <div className="mt-4 space-y-3">{rows.map((r)=><div key={r.id} className="vi-card p-4 text-sm"><p className="font-semibold">{r.course?.[0]?.title} · {r.status}</p><p>{r.institute?.[0]?.name ?? "Institute"}</p><p>{r.proposed_syllabus_text?.slice(0,280) ?? "No text"}</p>{r.proposed_file_path ? <p>PDF: {r.proposed_file_name ?? "syllabus.pdf"}</p>:null}{r.rejection_reason?<p className="text-rose-600">Reason: {r.rejection_reason}</p>:null}<form action={moderate} className="mt-2 flex flex-wrap gap-2"><input type="hidden" name="id" value={r.id}/><button name="action" value="approve" className="rounded bg-emerald-600 px-2 py-1 text-white">Approve</button><input name="rejectionReason" placeholder="Rejection reason" className="rounded border px-2 py-1"/><button name="action" value="reject" className="rounded bg-amber-600 px-2 py-1 text-white">Reject</button><button name="action" value="delete" className="rounded bg-rose-600 px-2 py-1 text-white">Delete</button></form></div>)}</div></div>;
}
