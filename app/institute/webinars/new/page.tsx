import { WebinarForm } from "@/components/webinars/webinar-form";
import { requireUser } from "@/lib/auth/get-session";

export default async function NewWebinarPage() {
  await requireUser("institute", { requireApproved: false });

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Schedule Webinar</h1>
      <p className="mt-1 text-sm text-slate-600">New webinars are submitted for admin approval automatically.</p>
      <div className="mt-6 rounded-xl border bg-white p-5">
        <WebinarForm mode="create" />
      </div>
    </div>
  );
}
