import { ProfileSettingsForm } from "@/components/profile/profile-settings-form";
import { requireUser } from "@/lib/auth/get-session";

export default async function InstituteProfilePage() {
  await requireUser("institute", { requireApproved: false });

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="text-2xl font-semibold">Institute Profile</h1>
      <p className="mt-2 text-sm text-slate-600">
        Manage institute and account details including avatar, contact info, compliance identifiers and password.
      </p>
      <ProfileSettingsForm role="institute" />
    </div>
  );
}
