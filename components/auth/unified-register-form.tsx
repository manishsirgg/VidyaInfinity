"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Role = "student" | "institute" | "admin";

export function UnifiedRegisterForm() {
  const router = useRouter();
  const [role, setRole] = useState<Role>("student");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const roleLabel = useMemo(() => {
    if (role === "institute") return "Institute / University / College";
    if (role === "admin") return "Admin";
    return "Student";
  }, [role]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    const formData = new FormData(event.currentTarget);

    const response = await fetch("/api/auth/register", {
      method: "POST",
      body: formData,
    });

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

  return (
    <form onSubmit={onSubmit} className="mt-6 grid gap-3 rounded-xl border bg-white p-4">
      <label className="text-sm font-medium text-slate-700">Register as</label>
      <select name="role" value={role} onChange={(event) => setRole(event.target.value as Role)} className="rounded border px-3 py-2">
        <option value="student">Student</option>
        <option value="institute">Institute / University / College</option>
        <option value="admin">Admin</option>
      </select>

      <input required name="fullName" placeholder="Full name" className="rounded border px-3 py-2" />
      <input required type="email" name="email" placeholder="Email" className="rounded border px-3 py-2" />
      <input required type="password" name="password" minLength={8} placeholder="Password (min 8 chars)" className="rounded border px-3 py-2" />
      <input required name="phone" placeholder="Phone number" className="rounded border px-3 py-2" />
      <input name="alternatePhone" placeholder="Alternate phone (optional)" className="rounded border px-3 py-2" />
      <input type="date" name="dateOfBirth" className="rounded border px-3 py-2" />

      <select required name="gender" className="rounded border px-3 py-2">
        <option value="">Select gender</option>
        <option value="female">Female</option>
        <option value="male">Male</option>
        <option value="other">Other</option>
        <option value="prefer_not_to_say">Prefer not to say</option>
      </select>

      <input required name="addressLine1" placeholder="Address line 1" className="rounded border px-3 py-2" />
      <input name="addressLine2" placeholder="Address line 2" className="rounded border px-3 py-2" />
      <input required name="city" placeholder="City" className="rounded border px-3 py-2" />
      <input required name="state" placeholder="State" className="rounded border px-3 py-2" />
      <input required name="country" placeholder="Country" className="rounded border px-3 py-2" />
      <input required name="postalCode" placeholder="Postal code" className="rounded border px-3 py-2" />

      {(role === "institute" || role === "admin") && (
        <>
          <input
            required
            name="organizationName"
            placeholder={role === "admin" ? "Organization / Department name" : "Institute / University / College name"}
            className="rounded border px-3 py-2"
          />
          <input name="legalName" placeholder="Legal entity name" className="rounded border px-3 py-2" />
          <select required name="organizationType" className="rounded border px-3 py-2">
            <option value="">Select organization type</option>
            <option value="school">School</option>
            <option value="coaching_institute">Coaching Institute</option>
            <option value="college">College</option>
            <option value="university">University</option>
            <option value="edtech">EdTech</option>
            <option value="administration">Administration</option>
          </select>
          <input required name="designation" placeholder="Your designation" className="rounded border px-3 py-2" />
          <input name="registrationNumber" placeholder="Registration number" className="rounded border px-3 py-2" />
          <input name="accreditationNumber" placeholder="Accreditation / affiliation number" className="rounded border px-3 py-2" />
          <input name="websiteUrl" placeholder="Website URL" className="rounded border px-3 py-2" />
          <input name="establishedYear" type="number" min={1800} max={2100} placeholder="Established year" className="rounded border px-3 py-2" />
          <input name="studentStrength" type="number" min={0} placeholder="Total students" className="rounded border px-3 py-2" />
          <input name="staffStrength" type="number" min={0} placeholder="Total staff" className="rounded border px-3 py-2" />
        </>
      )}

      <label className="text-sm font-medium text-slate-700">Identity document type</label>
      <select required name="identityDocumentType" className="rounded border px-3 py-2">
        <option value="">Select identity document</option>
        <option value="aadhaar_card">Aadhaar Card</option>
        <option value="passport">Passport</option>
        <option value="driving_license">Driving License</option>
        <option value="voter_id">Voter ID</option>
      </select>
      <input required type="file" name="identityDocument" accept="application/pdf,image/png,image/jpeg" className="rounded border px-3 py-2" />

      {(role === "institute" || role === "admin") && (
        <>
          <label className="text-sm font-medium text-slate-700">
            {role === "admin" ? "Admin authorization document type" : `${roleLabel} approval document type`}
          </label>
          <select required name="approvalDocumentType" className="rounded border px-3 py-2">
            <option value="">Select approval document</option>
            <option value="registration_certificate">Registration Certificate</option>
            <option value="accreditation_letter">Accreditation Letter</option>
            <option value="board_resolution">Board Resolution / Authorization</option>
            <option value="government_approval">Government Approval Document</option>
          </select>
          <input required type="file" name="approvalDocument" accept="application/pdf,image/png,image/jpeg" className="rounded border px-3 py-2" />
        </>
      )}

      <button disabled={loading} className="rounded bg-brand-600 px-4 py-2 text-white" type="submit">
        {loading ? "Submitting..." : `Register as ${roleLabel}`}
      </button>

      {message && <p className="text-sm text-emerald-700">{message}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <p className="text-xs text-slate-500">
        Every registration goes through admin verification. Accounts become active only after admin approval.
      </p>
    </form>
  );
}
