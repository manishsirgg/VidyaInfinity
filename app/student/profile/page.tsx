import { ProfileSettingsForm } from "@/components/profile/profile-settings-form";
import { requireUser } from "@/lib/auth/get-session";

export default async function StudentProfilePage() {
  await requireUser("student", { requireApproved: false });

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="text-2xl font-semibold">Student Profile</h1>
      <p className="mt-2 text-sm text-slate-600">
        Manage your personal information, contact details, password, and identity document. If your profile was rejected,
        update details here and resubmit for review.
      </p>
      <ProfileSettingsForm role="student" />
    </div>
  );
}
