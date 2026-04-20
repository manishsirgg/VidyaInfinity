"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { INSTITUTE_APPROVAL_DOCUMENT_OPTIONS, getInstituteApprovalSubtypeLabel } from "@/lib/constants/institute-documents";
import { ORGANIZATION_TYPE_OPTIONS, normalizeOrganizationType } from "@/lib/constants/organization-types";

type Props = {
  role: "student" | "institute" | "admin";
};

type GenericPayload = Record<string, string | number | null | undefined>;

type UserDocument = {
  id: string;
  document_category: string;
  document_type: string;
  status: string;
  rejection_reason: string | null;
  created_at: string;
};

type InstituteDocument = {
  id: string;
  type: string;
  subtype: string | null;
  status: string;
  created_at: string;
};

type NotificationItem = {
  id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
};

type InstituteMediaItem = {
  id: string;
  media_type: "image" | "video";
  file_name: string | null;
  file_size: number | null;
  created_at: string;
  publicUrl: string | null;
};

function formatDateTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function parseJsonObject(value: string) {
  if (!value) return null;
  try {
    return JSON.parse(value) as { error?: unknown };
  } catch {
    return null;
  }
}

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
  const [userDocuments, setUserDocuments] = useState<UserDocument[]>([]);
  const [instituteDocuments, setInstituteDocuments] = useState<InstituteDocument[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notificationsAvailable, setNotificationsAvailable] = useState(true);
  const [instituteMedia, setInstituteMedia] = useState<InstituteMediaItem[]>([]);
  const [pendingInstituteMediaFiles, setPendingInstituteMediaFiles] = useState<File[]>([]);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError("");

    const response = await fetch("/api/account/profile", { cache: "no-store" });
    const body = await response.json().catch(() => null);

    setLoading(false);

    if (!response.ok) {
      const nextError =
        typeof body?.error === "string" && body.error.trim().length > 0 ? body.error : "Unable to load profile details right now.";
      setError(nextError);
      return;
    }

    setProfile(body?.profile ?? {});
    setDetails(body?.details ?? {});
    setInstitute(body?.institute ?? {});
    setUserDocuments(Array.isArray(body?.userDocuments) ? body.userDocuments : []);
    setInstituteDocuments(Array.isArray(body?.instituteDocuments) ? body.instituteDocuments : []);
    setNotifications(Array.isArray(body?.notifications) ? body.notifications : []);
    setNotificationsAvailable(body?.notificationsAvailable !== false);
    setInstituteMedia(Array.isArray(body?.instituteMedia) ? body.instituteMedia : []);
  }, []);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const effectiveStatus = useMemo(() => {
    if (role === "institute") {
      return String(institute.status ?? profile.approval_status ?? "pending");
    }

    return String(profile.approval_status ?? "pending");
  }, [role, institute.status, profile.approval_status]);

  const effectiveRejectionReason = useMemo(() => {
    if (role === "institute") {
      return String(institute.rejection_reason ?? profile.rejection_reason ?? "");
    }

    return String(profile.rejection_reason ?? "");
  }, [role, institute.rejection_reason, profile.rejection_reason]);

  const isRejected = effectiveStatus === "rejected";
  const isPending = effectiveStatus === "pending";

  const selectedOrganizationType = useMemo(() => {
    const profileValue = String(institute.organization_type ?? profile.organization_type ?? "");
    return normalizeOrganizationType(profileValue) ?? "";
  }, [institute.organization_type, profile.organization_type]);

  const identityDocuments = useMemo(
    () => userDocuments.filter((doc) => doc.document_category === "identity"),
    [userDocuments]
  );

  const authorizationDocuments = useMemo(
    () => userDocuments.filter((doc) => doc.document_category === "authorization"),
    [userDocuments]
  );

  async function submitProfile(form: FormData, resubmit: boolean) {
    if (resubmit) {
      form.set("resubmit", "true");
    }

    const response = await fetch("/api/account/profile", {
      method: "PATCH",
      body: form,
    });

    const raw = await response.text();
    const body = parseJsonObject(raw);
    if (!response.ok) {
      throw new Error((typeof body?.error === "string" && body.error) || "Unable to update profile");
    }

    return body;
  }

  async function uploadInstituteMediaFiles(files: File[]) {
    if (files.length === 0) return;

    for (const file of files) {
      const mediaForm = new FormData();
      mediaForm.set("file", file);

      const response = await fetch("/api/account/profile/institute-media", {
        method: "POST",
        body: mediaForm,
      });

      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error((typeof body?.error === "string" && body.error) || `Unable to upload ${file.name}`);
      }
    }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");

    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const workflow = submitter?.value === "resubmit" ? "resubmit" : "save";

    try {
      const formData = new FormData(event.currentTarget);
      const mediaFiles = formData.getAll("instituteMedia").filter((item): item is File => item instanceof File && item.size > 0);
      formData.delete("instituteMedia");

      await submitProfile(formData, workflow === "resubmit");

      if (role === "institute" && mediaFiles.length > 0) {
        await uploadInstituteMediaFiles(mediaFiles);
      }

      setPendingInstituteMediaFiles([]);
      setMessage(
        workflow === "resubmit"
          ? "Resubmission sent. Your account is back under review."
          : role === "institute" && mediaFiles.length > 0
            ? "Profile updated and media uploaded successfully."
            : "Profile updated successfully."
      );
      await loadProfile();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : workflow === "resubmit" ? "Unable to resubmit profile" : "Unable to update profile");
    } finally {
      setSaving(false);
    }
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

    const body = await response.json().catch(() => null);
    setPasswordSaving(false);

    if (!response.ok) {
      setPasswordError((typeof body?.error === "string" && body.error) || "Unable to update password");
      return;
    }

    setPasswordMessage("Password updated successfully.");
    event.currentTarget.reset();
  }

  return (
    <div className="mt-6 space-y-6">
      {loading ? <p className="text-sm text-slate-600">Loading profile...</p> : null}

      <div className="rounded-xl border bg-white p-4 text-sm">
        <p>
          Account review status: <span className="font-semibold">{effectiveStatus}</span>
        </p>
        {effectiveRejectionReason ? <p className="mt-1 text-rose-700">Rejection reason: {effectiveRejectionReason}</p> : null}
        {isPending ? <p className="mt-1 text-amber-700">Your account is pending moderation.</p> : null}
      </div>

      <form onSubmit={saveProfile} className="grid gap-3 rounded-xl border bg-white p-4">
        <div className="flex items-center gap-4 rounded-lg border border-slate-200 p-3">
          <div className="h-16 w-16 overflow-hidden rounded-full border border-slate-200 bg-slate-100">
            {profile.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
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

        <h3 className="mt-2 text-sm font-semibold text-slate-700">Basic details</h3>
        <input required name="fullName" defaultValue={String(profile.full_name ?? "")} placeholder="Full name" className="rounded border px-3 py-2" />
        <input required type="email" name="email" defaultValue={String(profile.email ?? "")} placeholder="Email" className="rounded border px-3 py-2" />
        <input name="phone" defaultValue={String(profile.phone ?? "")} placeholder="Phone number" className="rounded border px-3 py-2" />
        <input name="city" defaultValue={String(profile.city ?? "")} placeholder="City" className="rounded border px-3 py-2" />
        <input name="state" defaultValue={String(profile.state ?? "")} placeholder="State" className="rounded border px-3 py-2" />
        <input name="country" defaultValue={String(profile.country ?? "")} placeholder="Country" className="rounded border px-3 py-2" />

        {(role === "admin" || role === "institute") ? (
          <input name="designation" defaultValue={String(profile.designation ?? "")} placeholder="Designation" className="rounded border px-3 py-2" />
        ) : null}

        {role === "institute" ? (
          <>
            <h3 className="mt-2 text-sm font-semibold text-slate-700">Institute identity</h3>
            <input name="organizationName" defaultValue={String(profile.organization_name ?? "")} placeholder="Institute / Organization name" className="rounded border px-3 py-2" />
            <select name="organizationType" defaultValue={selectedOrganizationType} className="rounded border px-3 py-2">
              <option value="">Select organization type</option>
              {ORGANIZATION_TYPE_OPTIONS.map((organizationType) => (
                <option key={organizationType} value={organizationType}>
                  {organizationType}
                </option>
              ))}
            </select>
          </>
        ) : null}

        {(role === "student" || role === "institute") ? (
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
        ) : null}

        {role === "institute" ? (
          <>
            <h3 className="mt-2 text-sm font-semibold text-slate-700">Institute business details</h3>
            <input name="instituteName" defaultValue={String(institute.name ?? profile.organization_name ?? "")} placeholder="Institute name" className="rounded border px-3 py-2" />
            <input name="legalEntityName" defaultValue={String(institute.legal_entity_name ?? "")} placeholder="Legal entity name" className="rounded border px-3 py-2" />
            <input name="registrationNumber" defaultValue={String(institute.registration_number ?? "")} placeholder="Registration number" className="rounded border px-3 py-2" />
            <input
              name="accreditationAffiliationNumber"
              defaultValue={String(institute.accreditation_affiliation_number ?? "")}
              placeholder="Accreditation / affiliation number"
              className="rounded border px-3 py-2"
            />
            <input name="websiteUrl" defaultValue={String(institute.website_url ?? "")} placeholder="Website URL" className="rounded border px-3 py-2" />
            <input
              name="establishedYear"
              type="number"
              min={1800}
              max={new Date().getFullYear()}
              defaultValue={String(institute.established_year ?? "")}
              placeholder="Established year"
              className="rounded border px-3 py-2"
            />
            <input name="totalStudents" type="number" min={0} defaultValue={String(institute.total_students ?? "")} placeholder="Total students" className="rounded border px-3 py-2" />
            <input name="totalStaff" type="number" min={0} defaultValue={String(institute.total_staff ?? "")} placeholder="Total staff" className="rounded border px-3 py-2" />
            <textarea
              name="description"
              defaultValue={String(institute.description ?? "")}
              placeholder="Institute description (max 2500 words)"
              className="min-h-24 rounded border px-3 py-2"
            />
            <p className="text-xs text-slate-500">Keep institute description within 2500 words.</p>

            <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-sm font-semibold text-slate-700">Institute showcase media</p>
              <p className="mt-1 text-xs text-slate-500">
                Upload up to 8 files at once (max total 20). Images up to 5MB each, videos up to 20MB each.
              </p>
              <input
                name="instituteMedia"
                type="file"
                multiple
                accept="image/png,image/jpeg,image/webp,video/mp4"
                className="mt-2 rounded border bg-white px-3 py-2"
                onChange={(event) => {
                  const files = Array.from(event.currentTarget.files ?? []);
                  setPendingInstituteMediaFiles(files);
                }}
              />
              {pendingInstituteMediaFiles.length > 0 ? (
                <p className="mt-1 text-xs text-slate-500">{pendingInstituteMediaFiles.length} file(s) selected. Files upload when you click Save profile.</p>
              ) : null}
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-sm font-semibold text-slate-700">Uploaded showcase media ({instituteMedia.length}/20)</p>
              {instituteMedia.length === 0 ? <p className="mt-2 text-xs text-slate-500">No media uploaded yet.</p> : null}
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                {instituteMedia.map((item) => (
                  <div key={item.id} className="rounded border border-slate-200 bg-white p-2">
                    {item.publicUrl ? (
                      item.media_type === "image" ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.publicUrl} alt={item.file_name ?? "Institute image"} className="h-32 w-full rounded object-cover" />
                      ) : (
                        <video src={item.publicUrl} controls className="h-32 w-full rounded object-cover" />
                      )
                    ) : (
                      <div className="flex h-32 items-center justify-center rounded bg-slate-100 text-xs text-slate-500">Preview unavailable</div>
                    )}
                    <p className="mt-2 truncate text-xs text-slate-700">{item.file_name ?? "Untitled file"}</p>
                    <p className="text-[11px] text-slate-500">
                      {item.media_type.toUpperCase()} · {item.file_size ? `${(item.file_size / (1024 * 1024)).toFixed(2)}MB` : "size unknown"}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : null}

        <h3 className="mt-2 text-sm font-semibold text-slate-700">Identity document</h3>
        <select name="identityDocumentType" className="rounded border px-3 py-2">
          <option value="">Select identity document type</option>
          <option value="aadhaar_card">Aadhaar Card</option>
          <option value="passport">Passport</option>
          <option value="driving_license">Driving License</option>
          <option value="voter_id">Voter ID</option>
          <option value="employee_id">Employee ID</option>
        </select>
        <input name="identityDocument" type="file" accept="application/pdf,image/png,image/jpeg" className="rounded border px-3 py-2" />

        {role === "admin" ? (
          <>
            <h3 className="mt-2 text-sm font-semibold text-slate-700">Authorization document</h3>
            <select name="adminAuthorizationDocumentType" className="rounded border px-3 py-2">
              <option value="">Select authorization document type</option>
              <option value="authorization_letter">Authorization Letter</option>
              <option value="employee_id">Employee ID</option>
              <option value="appointment_letter">Appointment Letter</option>
            </select>
            <input name="adminAuthorizationDocument" type="file" accept="application/pdf,image/png,image/jpeg" className="rounded border px-3 py-2" />
          </>
        ) : null}

        {role === "institute" ? (
          <>
            <h3 className="mt-2 text-sm font-semibold text-slate-700">Institute approval document</h3>
            <select name="instituteApprovalDocumentType" className="rounded border px-3 py-2">
              <option value="">Select institute document type</option>
              {INSTITUTE_APPROVAL_DOCUMENT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <input name="instituteApprovalDocument" type="file" accept="application/pdf,image/png,image/jpeg" className="rounded border px-3 py-2" />
          </>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <button disabled={saving} type="submit" value="save" className="rounded bg-brand-600 px-4 py-2 text-white">
            {saving ? "Saving..." : "Save profile"}
          </button>
          {isRejected ? (
            <button disabled={saving} type="submit" value="resubmit" className="rounded bg-emerald-600 px-4 py-2 text-white">
              {saving ? "Resubmitting..." : "Resubmit for review"}
            </button>
          ) : null}
        </div>

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

      <div className="rounded-xl border bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-700">Identity documents</h3>
        <div className="mt-3 space-y-2 text-sm">
          {identityDocuments.length === 0 ? <p className="text-slate-500">No identity documents uploaded yet.</p> : null}
          {identityDocuments.map((doc) => (
            <div key={doc.id} className="rounded border border-slate-200 bg-slate-50 p-2">
              <p>
                {doc.document_type} · {doc.status}
              </p>
              {doc.rejection_reason ? <p className="text-rose-700">Reason: {doc.rejection_reason}</p> : null}
              <p className="text-xs text-slate-500">Uploaded: {formatDateTime(doc.created_at)}</p>
            </div>
          ))}
        </div>
      </div>

      {role === "admin" ? (
        <div className="rounded-xl border bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-700">Authorization documents</h3>
          <div className="mt-3 space-y-2 text-sm">
            {authorizationDocuments.length === 0 ? <p className="text-slate-500">No authorization documents uploaded yet.</p> : null}
            {authorizationDocuments.map((doc) => (
              <div key={doc.id} className="rounded border border-slate-200 bg-slate-50 p-2">
                <p>
                  {doc.document_type} · {doc.status}
                </p>
                {doc.rejection_reason ? <p className="text-rose-700">Reason: {doc.rejection_reason}</p> : null}
                <p className="text-xs text-slate-500">Uploaded: {formatDateTime(doc.created_at)}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {role === "institute" ? (
        <div className="rounded-xl border bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-700">Institute approval documents</h3>
          <div className="mt-3 space-y-2 text-sm">
            {instituteDocuments.length === 0 ? <p className="text-slate-500">No institute approval documents uploaded yet.</p> : null}
            {instituteDocuments.map((doc) => (
              <div key={doc.id} className="rounded border border-slate-200 bg-slate-50 p-2">
                <p>
                  {doc.type} · {getInstituteApprovalSubtypeLabel(doc.subtype)} · {doc.status}
                </p>
                <p className="text-xs text-slate-500">Uploaded: {formatDateTime(doc.created_at)}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="rounded-xl border bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-700">Recent notifications</h3>
        <div className="mt-3 space-y-2 text-sm">
          {!notificationsAvailable ? (
            <p className="text-amber-700">
              Notifications are temporarily unavailable for this deployment. Your login and profile updates still work normally.
            </p>
          ) : null}

          {notifications.length === 0 ? <p className="text-slate-500">No notifications yet.</p> : null}
          {notifications.map((item) => (
            <div key={item.id} className="rounded border border-slate-200 bg-slate-50 p-2">
              <p className="font-medium">{item.title}</p>
              <p className="text-slate-700">{item.message}</p>
              <p className="text-xs text-slate-500">{formatDateTime(item.created_at)}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
