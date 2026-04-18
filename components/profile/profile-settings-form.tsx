"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type Props = {
  role: "student" | "institute" | "admin";
};

type GenericPayload = Record<string, string | number | null | undefined>;

export function ProfileSettingsForm({ role }: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [profile, setProfile] = useState<GenericPayload>({});
  const [details, setDetails] = useState<GenericPayload>({});
  const [institute, setInstitute] = useState<GenericPayload>({});

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError("");
    const response = await fetch("/api/account/profile");
    const body = await response.json();
    setLoading(false);
    if (!response.ok) {
      setError(body.error ?? "Unable to load profile");
      return;
    }
    setProfile(body.profile ?? {});
    setDetails(body.details ?? {});
    setInstitute(body.institute ?? {});
  }, []);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");

    const formData = new FormData(event.currentTarget);
    const response = await fetch("/api/account/profile", {
      method: "PATCH",
      body: formData,
    });

    const body = await response.json();
    setSaving(false);

    if (!response.ok) {
      setError(body.error ?? "Unable to update profile");
      return;
    }

    setMessage("Profile updated successfully.");
    void loadProfile();
  }

  async function savePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordSaving(true);
    setPasswordError("");
    setPasswordMessage("");

    const formData = new FormData(event.currentTarget);
    const response = await fetch("/api/account/password", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentPassword: formData.get("currentPassword"),
        newPassword: formData.get("newPassword"),
        confirmPassword: formData.get("confirmPassword"),
      }),
    });

    const body = await response.json();
    setPasswordSaving(false);

    if (!response.ok) {
      setPasswordError(body.error ?? "Unable to update password");
      return;
    }

    setPasswordMessage("Password updated successfully.");
    event.currentTarget.reset();
  }

  return (
    <div className="mt-6 space-y-6">
      {loading ? <p className="text-sm text-slate-600">Loading profile...</p> : null}
      <form onSubmit={saveProfile} className="grid gap-3 rounded-xl border bg-white p-4">
        <div className="flex items-center gap-4 rounded-lg border border-slate-200 p-3">
          <div className="h-16 w-16 overflow-hidden rounded-full border border-slate-200 bg-slate-100">
            {profile.avatar_url ? (
              <img src={String(profile.avatar_url)} alt="Profile avatar" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-slate-500">No Avatar</div>
            )}
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium text-slate-700" htmlFor="avatarUpload">
              Update avatar
            </label>
            <input id="avatarUpload" name="avatar" type="file" accept="image/png,image/jpeg,image/webp" className="text-sm" />
            <p className="text-xs text-slate-500">PNG, JPG or WEBP up to 3MB.</p>
          </div>
        </div>

        <input required name="fullName" defaultValue={String(profile.full_name ?? "")} placeholder="Full name" className="rounded border px-3 py-2" />
        <input required type="email" name="email" defaultValue={String(profile.email ?? "")} placeholder="Email" className="rounded border px-3 py-2" />
        <input name="phone" defaultValue={String(profile.phone ?? "")} placeholder="Phone number" className="rounded border px-3 py-2" />
        <input name="city" defaultValue={String(profile.city ?? "")} placeholder="City" className="rounded border px-3 py-2" />
        <input name="state" defaultValue={String(profile.state ?? "")} placeholder="State" className="rounded border px-3 py-2" />
        <input name="country" defaultValue={String(profile.country ?? "")} placeholder="Country" className="rounded border px-3 py-2" />

        <input name="organizationName" defaultValue={String(profile.organization_name ?? "")} placeholder="Organization name" className="rounded border px-3 py-2" />
        <input name="organizationType" defaultValue={String(profile.organization_type ?? "")} placeholder="Organization type" className="rounded border px-3 py-2" />
        <input name="designation" defaultValue={String(profile.designation ?? "")} placeholder="Designation" className="rounded border px-3 py-2" />

        {(role === "student" || role === "institute") && (
          <>
            <h3 className="mt-2 text-sm font-semibold text-slate-700">Personal details</h3>
            <input name="alternatePhone" defaultValue={String(details.alternate_phone ?? "")} placeholder="Alternate phone" className="rounded border px-3 py-2" />
            <input name="dob" type="date" defaultValue={String(details.dob ?? "")} className="rounded border px-3 py-2" />
            <select name="gender" defaultValue={String(details.gender ?? "")} className="rounded border px-3 py-2">
              <option value="">Select gender</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="other">Other</option>
              <option value="prefer_not_to_say">Prefer not to say</option>
            </select>
            <input name="addressLine1" defaultValue={String(details.address_line_1 ?? "")} placeholder="Address line 1" className="rounded border px-3 py-2" />
            <input name="addressLine2" defaultValue={String(details.address_line_2 ?? "")} placeholder="Address line 2" className="rounded border px-3 py-2" />
            <input name="postalCode" defaultValue={String(details.postal_code ?? "")} placeholder="Postal code" className="rounded border px-3 py-2" />
          </>
        )}

        {role === "institute" && (
          <>
            <h3 className="mt-2 text-sm font-semibold text-slate-700">Institute details</h3>
            <input name="instituteName" defaultValue={String(institute.name ?? "")} placeholder="Institute name" className="rounded border px-3 py-2" />
            <input name="legalEntityName" defaultValue={String(institute.legal_entity_name ?? "")} placeholder="Legal entity name" className="rounded border px-3 py-2" />
            <input name="registrationNumber" defaultValue={String(institute.registration_number ?? "")} placeholder="Registration number" className="rounded border px-3 py-2" />
            <input
              name="accreditationAffiliationNumber"
              defaultValue={String(institute.accreditation_affiliation_number ?? "")}
              placeholder="Accreditation / affiliation number"
              className="rounded border px-3 py-2"
            />
            <input name="websiteUrl" defaultValue={String(institute.website_url ?? "")} placeholder="Website URL" className="rounded border px-3 py-2" />
            <input name="establishedYear" type="number" min={1800} max={new Date().getFullYear()} defaultValue={String(institute.established_year ?? "")} placeholder="Established year" className="rounded border px-3 py-2" />
            <input name="totalStudents" type="number" min={0} defaultValue={String(institute.total_students ?? "")} placeholder="Total students" className="rounded border px-3 py-2" />
            <input name="totalStaff" type="number" min={0} defaultValue={String(institute.total_staff ?? "")} placeholder="Total staff" className="rounded border px-3 py-2" />
            <textarea name="description" defaultValue={String(institute.description ?? "")} placeholder="Institute description" className="min-h-24 rounded border px-3 py-2" />
          </>
        )}

        <button disabled={saving} type="submit" className="rounded bg-brand-600 px-4 py-2 text-white">
          {saving ? "Saving..." : "Save profile"}
        </button>

        {message && <p className="text-sm text-emerald-700">{message}</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>

      <form onSubmit={savePassword} className="grid gap-3 rounded-xl border bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-700">Change password</h3>
        <input required type="password" name="currentPassword" placeholder="Current password" className="rounded border px-3 py-2" />
        <input required minLength={8} type="password" name="newPassword" placeholder="New password" className="rounded border px-3 py-2" />
        <input required minLength={8} type="password" name="confirmPassword" placeholder="Confirm new password" className="rounded border px-3 py-2" />
        <button disabled={passwordSaving} type="submit" className="rounded bg-slate-900 px-4 py-2 text-white">
          {passwordSaving ? "Updating..." : "Update password"}
        </button>
        {passwordMessage && <p className="text-sm text-emerald-700">{passwordMessage}</p>}
        {passwordError && <p className="text-sm text-red-600">{passwordError}</p>}
      </form>
    </div>
  );
}
