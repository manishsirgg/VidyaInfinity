import { ProfileSettingsForm } from "@/components/profile/profile-settings-form";
import { requireUser } from "@/lib/auth/get-session";

export default async function AdminProfilePage() {
  await requireUser("admin");

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="text-2xl font-semibold">Admin Profile</h1>
      <p className="mt-2 text-sm text-slate-600">Manage your admin account details, contact information and password.</p>
      <ProfileSettingsForm role="admin" />
    </div>
  );
}
