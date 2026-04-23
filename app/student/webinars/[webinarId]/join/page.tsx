import Link from "next/link";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/get-session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { resolveWebinarJoinAccess } from "@/lib/webinars/join-access";

function formatDate(value: string | null | undefined) {
  if (!value) return "TBD";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

export default async function StudentWebinarJoinPage({ params }: { params: Promise<{ webinarId: string }> }) {
  const { user } = await requireUser("student", { requireApproved: false });
  const { webinarId } = await params;

  const admin = getSupabaseAdmin();
  const supabase = await createClient();
  const dataClient = admin.ok ? admin.data : supabase;

  const result = await resolveWebinarJoinAccess(dataClient, user.id, webinarId);

  if (result.decision === "allowed" && result.meetingUrl) {
    redirect(result.meetingUrl);
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <div className="rounded-xl border bg-white p-6">
        <h1 className="text-2xl font-semibold">Secure Webinar Join</h1>
        <p className="mt-2 text-sm text-slate-600">Webinar access is controlled from inside Vidya Infinity to reduce early link leakage.</p>

        {result.decision === "waiting_for_reveal_window" ? (
          <div className="mt-4 rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            <p className="font-semibold">Registration Confirmed</p>
            <p className="mt-1">Join access unlocks 15 minutes before webinar starts.</p>
            <p className="mt-1">Unlock Time: {formatDate(result.revealAt)}</p>
            <p className="mt-1">Webinar Start: {formatDate(result.webinar?.starts_at ?? null)}</p>
          </div>
        ) : null}

        {result.decision === "denied_refunded" || result.decision === "denied_revoked" ? (
          <div className="mt-4 rounded border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            <p className="font-semibold">Access Revoked</p>
            <p className="mt-1">Webinar access is no longer available for this registration.</p>
          </div>
        ) : null}

        {result.decision === "denied_not_registered" ? (
          <div className="mt-4 rounded border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            <p className="font-semibold">Access Denied</p>
            <p className="mt-1">You do not have an active registration for this webinar.</p>
          </div>
        ) : null}

        <div className="mt-5 flex gap-2">
          <Link href="/student/webinar-registrations" className="rounded border px-3 py-2 text-sm">My Webinar Registrations</Link>
          <Link href={`/webinars/${webinarId}`} className="rounded bg-brand-600 px-3 py-2 text-sm text-white">Back to Webinar</Link>
        </div>
      </div>
    </div>
  );
}
