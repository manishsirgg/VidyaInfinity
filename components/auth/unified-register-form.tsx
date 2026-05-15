"use client";

import { ChangeEvent, FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { INSTITUTE_APPROVAL_DOCUMENT_OPTIONS } from "@/lib/constants/institute-documents";
import { ORGANIZATION_TYPE_OPTIONS } from "@/lib/constants/organization-types";

type Role = "student" | "institute" | "admin";

type RegisterValues = Record<string, string>;

type RegisterFiles = {
  avatar?: File | null;
  identityDocument?: File | null;
  instituteApprovalDocument?: File | null;
  adminAuthorizationDocument?: File | null;
  instituteMedia?: File[];
};

export function UnifiedRegisterForm() {
  const router = useRouter();
  const [role, setRole] = useState<Role>("student");
  const [step, setStep] = useState(1);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [values, setValues] = useState<RegisterValues>({ role: "student" });
  const [files, setFiles] = useState<RegisterFiles>({});

  const roleLabel = useMemo(() => {
    if (role === "institute") return "Institute / University / College";
    if (role === "admin") return "Admin";
    return "Student";
  }, [role]);

  const maxStep = role === "institute" ? 4 : 3;

  function updateValue(key: string, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function onRoleChange(nextRole: Role) {
    setRole(nextRole);
    setStep(1);
    setValues((current) => ({ ...current, role: nextRole }));
  }

  function onSingleFileChange(key: keyof RegisterFiles, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setFiles((current) => ({ ...current, [key]: file }));
  }

  function onMultiFileChange(event: ChangeEvent<HTMLInputElement>) {
    const media = Array.from(event.target.files ?? []);
    setFiles((current) => ({ ...current, instituteMedia: media }));
  }

  function validateCurrentStep(form: HTMLFormElement) {
    const stepFields = Array.from(form.querySelectorAll<HTMLElement>(`[data-step="${step}"] input, [data-step="${step}"] select, [data-step="${step}"] textarea`));
    for (const field of stepFields) {
      if (field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement) {
        if (!field.checkValidity()) {
          field.reportValidity();
          return false;
        }
      }
    }
    return true;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    const form = event.currentTarget;
    if (step < maxStep) {
      if (!validateCurrentStep(form)) return;
      setStep((current) => Math.min(maxStep, current + 1));
      return;
    }

    if (!validateCurrentStep(form)) return;

    const formData = new FormData();
    Object.entries(values).forEach(([key, value]) => formData.append(key, value));

    if (files.avatar) formData.append("avatar", files.avatar);
    if (files.identityDocument) formData.append("identityDocument", files.identityDocument);
    if (files.instituteApprovalDocument && role === "institute") formData.append("instituteApprovalDocument", files.instituteApprovalDocument);
    if (files.adminAuthorizationDocument && role === "admin") formData.append("adminAuthorizationDocument", files.adminAuthorizationDocument);
    if (role === "institute") {
      for (const file of files.instituteMedia ?? []) formData.append("instituteMedia", file);
    }

    setLoading(true);
    const response = await fetch("/api/auth/register", { method: "POST", body: formData });
    const body = await response.json();
    setLoading(false);

    if (!response.ok) {
      setError(body.error ?? "Registration failed");
      return;
    }

    setMessage(body.message ?? "Registration submitted");
    router.push(body.redirectPath ?? "/auth/login?status=pending_approval");
    router.refresh();
  }

  const showStudentBase = role === "student" || role === "institute";

  return (
    <form onSubmit={onSubmit} className="mt-6 grid gap-3 rounded-xl border bg-white p-4">
      <div className="flex items-center justify-between rounded border bg-slate-50 px-3 py-2 text-xs text-slate-700">
        <p>Step {step} of {maxStep}</p>
        <p>{roleLabel}</p>
      </div>

      <div data-step={1} className={step === 1 ? "grid gap-3" : "hidden"}>
        <label className="text-sm font-medium text-slate-700">Register as</label>
        <select name="role" value={role} onChange={(event) => onRoleChange(event.target.value as Role)} className="rounded border px-3 py-2">
          <option value="student">Student</option>
          <option value="institute">Institute / University / College</option>
          <option value="admin">Admin</option>
        </select>

        <input required name="fullName" value={values.fullName ?? ""} onChange={(event) => updateValue("fullName", event.target.value)} placeholder="Full name" className="rounded border px-3 py-2" />
        <input required type="email" name="email" value={values.email ?? ""} onChange={(event) => updateValue("email", event.target.value)} placeholder="Email" className="rounded border px-3 py-2" />
        <input required type="password" name="password" minLength={8} value={values.password ?? ""} onChange={(event) => updateValue("password", event.target.value)} placeholder="Password (min 8 chars)" className="rounded border px-3 py-2" />
        <input required name="phone" value={values.phone ?? ""} onChange={(event) => updateValue("phone", event.target.value)} placeholder="Phone number" className="rounded border px-3 py-2" />
        <label className="text-sm font-medium text-slate-700" htmlFor="registerAvatar">Profile avatar image</label>
        <input id="registerAvatar" type="file" name="avatar" accept="image/png,image/jpeg,image/webp" onChange={(event) => onSingleFileChange("avatar", event)} className="rounded border px-3 py-2" />
        <p className="text-xs text-slate-500">PNG, JPG or WEBP up to 3MB. Recommended: square image, 512×512 px (1:1).</p>
      </div>

      <div data-step={2} className={step === 2 ? "grid gap-3" : "hidden"}>
        {showStudentBase && (
          <>
            <input name="alternatePhone" value={values.alternatePhone ?? ""} onChange={(event) => updateValue("alternatePhone", event.target.value)} placeholder="Alternate phone (optional)" className="rounded border px-3 py-2" />
            <input required type="date" name="dateOfBirth" value={values.dateOfBirth ?? ""} onChange={(event) => updateValue("dateOfBirth", event.target.value)} className="rounded border px-3 py-2" />
            <select required name="gender" value={values.gender ?? ""} onChange={(event) => updateValue("gender", event.target.value)} className="rounded border px-3 py-2">
              <option value="">Select gender</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="other">Other</option>
              <option value="prefer_not_to_say">Prefer not to say</option>
            </select>
            <input required name="addressLine1" value={values.addressLine1 ?? ""} onChange={(event) => updateValue("addressLine1", event.target.value)} placeholder="Address line 1" className="rounded border px-3 py-2" />
            <input name="addressLine2" value={values.addressLine2 ?? ""} onChange={(event) => updateValue("addressLine2", event.target.value)} placeholder="Address line 2" className="rounded border px-3 py-2" />
            <input required name="city" value={values.city ?? ""} onChange={(event) => updateValue("city", event.target.value)} placeholder="City" className="rounded border px-3 py-2" />
            <input required name="state" value={values.state ?? ""} onChange={(event) => updateValue("state", event.target.value)} placeholder="State" className="rounded border px-3 py-2" />
            <input required name="country" value={values.country ?? ""} onChange={(event) => updateValue("country", event.target.value)} placeholder="Country" className="rounded border px-3 py-2" />
            <input required name="postalCode" value={values.postalCode ?? ""} onChange={(event) => updateValue("postalCode", event.target.value)} placeholder="Postal code" className="rounded border px-3 py-2" />
          </>
        )}

        {role === "admin" && (
          <>
            <input required name="designation" value={values.designation ?? ""} onChange={(event) => updateValue("designation", event.target.value)} placeholder="Designation" className="rounded border px-3 py-2" />
            <input required name="city" value={values.city ?? ""} onChange={(event) => updateValue("city", event.target.value)} placeholder="City" className="rounded border px-3 py-2" />
            <input required name="state" value={values.state ?? ""} onChange={(event) => updateValue("state", event.target.value)} placeholder="State" className="rounded border px-3 py-2" />
            <input required name="country" value={values.country ?? ""} onChange={(event) => updateValue("country", event.target.value)} placeholder="Country" className="rounded border px-3 py-2" />
          </>
        )}
      </div>

      <div data-step={3} className={step === 3 ? "grid gap-3" : "hidden"}>
        {role === "institute" ? (
          <>
            <input required name="organizationName" value={values.organizationName ?? ""} onChange={(event) => updateValue("organizationName", event.target.value)} placeholder="Institute / Organization name" className="rounded border px-3 py-2" />
            <input required name="instituteName" value={values.instituteName ?? ""} onChange={(event) => updateValue("instituteName", event.target.value)} placeholder="Institute name" className="rounded border px-3 py-2" />
            <input name="legalEntityName" value={values.legalEntityName ?? ""} onChange={(event) => updateValue("legalEntityName", event.target.value)} placeholder="Legal entity name" className="rounded border px-3 py-2" />
            <select required name="organizationType" value={values.organizationType ?? ""} onChange={(event) => updateValue("organizationType", event.target.value)} className="rounded border px-3 py-2">
              <option value="">Select organization type</option>
              {ORGANIZATION_TYPE_OPTIONS.map((organizationType) => (
                <option key={organizationType} value={organizationType}>{organizationType}</option>
              ))}
            </select>
            <input required name="designation" value={values.designation ?? ""} onChange={(event) => updateValue("designation", event.target.value)} placeholder="Your designation" className="rounded border px-3 py-2" />
            <input name="registrationNumber" value={values.registrationNumber ?? ""} onChange={(event) => updateValue("registrationNumber", event.target.value)} placeholder="Registration number" className="rounded border px-3 py-2" />
            <input name="accreditationAffiliationNumber" value={values.accreditationAffiliationNumber ?? ""} onChange={(event) => updateValue("accreditationAffiliationNumber", event.target.value)} placeholder="Accreditation / affiliation number" className="rounded border px-3 py-2" />
            <input name="websiteUrl" value={values.websiteUrl ?? ""} onChange={(event) => updateValue("websiteUrl", event.target.value)} placeholder="Website URL" className="rounded border px-3 py-2" />
            <input name="establishedYear" type="number" min={1800} max={2100} value={values.establishedYear ?? ""} onChange={(event) => updateValue("establishedYear", event.target.value)} placeholder="Established year" className="rounded border px-3 py-2" />
            <input name="totalStudents" type="number" min={0} value={values.totalStudents ?? ""} onChange={(event) => updateValue("totalStudents", event.target.value)} placeholder="Total students" className="rounded border px-3 py-2" />
            <input name="totalStaff" type="number" min={0} value={values.totalStaff ?? ""} onChange={(event) => updateValue("totalStaff", event.target.value)} placeholder="Total staff" className="rounded border px-3 py-2" />
            <textarea name="description" value={values.description ?? ""} onChange={(event) => updateValue("description", event.target.value)} placeholder="Institute description (max 2500 words)" className="min-h-24 rounded border px-3 py-2" />
            <label className="text-sm font-medium text-slate-700" htmlFor="instituteMedia">Institute media (images/videos)</label>
            <input id="instituteMedia" type="file" name="instituteMedia" accept="image/png,image/jpeg,image/webp,video/mp4" multiple onChange={onMultiFileChange} className="rounded border px-3 py-2" />
            <p className="text-xs text-slate-500">Optional. Upload up to 6 files (PNG, JPG, WEBP, MP4), max 20MB each. Recommended image size: 1280×720 px (16:9).</p>
          </>
        ) : (
          <>
            <label className="text-sm font-medium text-slate-700">Identity document type</label>
            <select required name="identityDocumentType" value={values.identityDocumentType ?? ""} onChange={(event) => updateValue("identityDocumentType", event.target.value)} className="rounded border px-3 py-2">
              <option value="">Select identity document</option>
              <option value="aadhaar_card">Aadhaar Card</option>
              <option value="passport">Passport</option>
              <option value="driving_license">Driving License</option>
              <option value="voter_id">Voter ID</option>
              <option value="employee_id">Employee ID</option>
            </select>
            <input required type="file" name="identityDocument" accept="application/pdf,image/png,image/jpeg" onChange={(event) => onSingleFileChange("identityDocument", event)} className="rounded border px-3 py-2" />

            {role === "admin" && (
              <>
                <label className="text-sm font-medium text-slate-700">Admin authorization document type</label>
                <select required name="adminAuthorizationDocumentType" value={values.adminAuthorizationDocumentType ?? ""} onChange={(event) => updateValue("adminAuthorizationDocumentType", event.target.value)} className="rounded border px-3 py-2">
                  <option value="">Select authorization document</option>
                  <option value="authorization_letter">Authorization Letter</option>
                  <option value="employee_id">Employee ID</option>
                  <option value="appointment_letter">Appointment Letter</option>
                  <option value="government_authorization">Government Authorization</option>
                </select>
                <input required type="file" name="adminAuthorizationDocument" accept="application/pdf,image/png,image/jpeg" onChange={(event) => onSingleFileChange("adminAuthorizationDocument", event)} className="rounded border px-3 py-2" />
              </>
            )}
          </>
        )}
      </div>

      {role === "institute" ? (
        <div data-step={4} className={step === 4 ? "grid gap-3" : "hidden"}>
          <label className="text-sm font-medium text-slate-700">Identity document type</label>
          <select required name="identityDocumentType" value={values.identityDocumentType ?? ""} onChange={(event) => updateValue("identityDocumentType", event.target.value)} className="rounded border px-3 py-2">
            <option value="">Select identity document</option>
            <option value="aadhaar_card">Aadhaar Card</option>
            <option value="passport">Passport</option>
            <option value="driving_license">Driving License</option>
            <option value="voter_id">Voter ID</option>
            <option value="employee_id">Employee ID</option>
          </select>
          <input required type="file" name="identityDocument" accept="application/pdf,image/png,image/jpeg" onChange={(event) => onSingleFileChange("identityDocument", event)} className="rounded border px-3 py-2" />
          <label className="text-sm font-medium text-slate-700">Institute approval document type</label>
          <select required name="instituteApprovalDocumentType" value={values.instituteApprovalDocumentType ?? ""} onChange={(event) => updateValue("instituteApprovalDocumentType", event.target.value)} className="rounded border px-3 py-2">
            <option value="">Select approval document</option>
            {INSTITUTE_APPROVAL_DOCUMENT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <input required type="file" name="instituteApprovalDocument" accept="application/pdf,image/png,image/jpeg" onChange={(event) => onSingleFileChange("instituteApprovalDocument", event)} className="rounded border px-3 py-2" />
        </div>
      ) : null}

      <div className="mt-2 flex gap-2">
        <button type="button" onClick={() => setStep((current) => Math.max(1, current - 1))} disabled={loading || step === 1} className="rounded border px-4 py-2 text-slate-700 disabled:opacity-50">Back</button>
        <button disabled={loading} className="rounded bg-brand-600 px-4 py-2 text-white" type="submit">
          {loading ? "Submitting..." : step < maxStep ? "Next step" : `Register as ${roleLabel}`}
        </button>
      </div>

      {message && <p className="text-sm text-emerald-700">{message}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <p className="text-xs text-slate-500">Every registration goes through admin verification. Accounts become active only after admin approval.</p>
    </form>
  );
}
