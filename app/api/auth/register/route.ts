import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  deleteFromBucket,
  uploadInstituteDocument,
  uploadUserDocument,
  STORAGE_BUCKETS,
} from "@/lib/storage/uploads";

type RegisterRole = "student" | "institute" | "admin";

function text(form: FormData, key: string) {
  return String(form.get(key) ?? "").trim();
}

function parseOptionalNumber(value: string) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isIsoDate(value: string) {
  if (!value) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function assertRequired(fields: Record<string, string>) {
  const missing = Object.entries(fields)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  return missing;
}

export async function POST(request: Request) {
  const uploadedPaths: Array<{ bucket: keyof Pick<typeof STORAGE_BUCKETS, "userDocuments" | "instituteDocuments">; path: string }> = [];
  let createdUserId: string | null = null;

  try {
    const form = await request.formData();

    const role = text(form, "role") as RegisterRole;
    if (!role || !["student", "institute", "admin"].includes(role)) {
      return NextResponse.json({ error: "Valid role is required" }, { status: 400 });
    }

    const fullName = text(form, "fullName");
    const email = text(form, "email").toLowerCase();
    const password = String(form.get("password") ?? "");

    const requiredForAll = assertRequired({
      fullName,
      email,
      password,
      phone: text(form, "phone"),
    });

    if (requiredForAll.length > 0) {
      return NextResponse.json({ error: `Missing required fields: ${requiredForAll.join(", ")}` }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }

    if (role === "student" || role === "institute") {
      const dateOfBirth = text(form, "dateOfBirth");
      const missing = assertRequired({
        dateOfBirth,
        gender: text(form, "gender"),
        addressLine1: text(form, "addressLine1"),
        city: text(form, "city"),
        state: text(form, "state"),
        country: text(form, "country"),
        postalCode: text(form, "postalCode"),
      });
      if (missing.length > 0) {
        return NextResponse.json({ error: `Missing required fields: ${missing.join(", ")}` }, { status: 400 });
      }

      if (!isIsoDate(dateOfBirth)) {
        return NextResponse.json({ error: "dateOfBirth must be a valid YYYY-MM-DD date" }, { status: 400 });
      }
    }

    if (role === "admin") {
      const missing = assertRequired({
        designation: text(form, "designation"),
        city: text(form, "city"),
        state: text(form, "state"),
        country: text(form, "country"),
      });
      if (missing.length > 0) {
        return NextResponse.json({ error: `Missing required fields: ${missing.join(", ")}` }, { status: 400 });
      }
    }

    if (role === "institute") {
      const missing = assertRequired({
        organizationName: text(form, "organizationName"),
        organizationType: text(form, "organizationType"),
        designation: text(form, "designation"),
      });
      if (missing.length > 0) {
        return NextResponse.json({ error: `Missing required fields: ${missing.join(", ")}` }, { status: 400 });
      }
    }

    const identityDocument = form.get("identityDocument");
    if (!(identityDocument instanceof File)) {
      return NextResponse.json({ error: "Identity document is required" }, { status: 400 });
    }

    const instituteApprovalDocument = form.get("instituteApprovalDocument");
    if (role === "institute" && !(instituteApprovalDocument instanceof File)) {
      return NextResponse.json({ error: "Institute approval document is required" }, { status: 400 });
    }

    const adminAuthorizationDocument = form.get("adminAuthorizationDocument");
    if (role === "admin" && !(adminAuthorizationDocument instanceof File)) {
      return NextResponse.json({ error: "Admin authorization document is required" }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

    const signUp = await admin.data.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        role,
      },
    });

    if (signUp.error || !signUp.data.user) {
      return NextResponse.json({ error: signUp.error?.message ?? "Registration failed" }, { status: 400 });
    }

    createdUserId = signUp.data.user.id;

    const profilePayload = {
      id: createdUserId,
      name: fullName,
      full_name: fullName,
      email,
      role,
      approval_status: "pending",
      phone: text(form, "phone") || null,
      organization_name: role === "institute" ? text(form, "organizationName") || null : null,
      organization_type: role === "institute" ? text(form, "organizationType") || null : null,
      designation: role === "institute" || role === "admin" ? text(form, "designation") || null : null,
      city: text(form, "city") || null,
      state: text(form, "state") || null,
      country: text(form, "country") || null,
    };

    const { error: profileError } = await admin.data.from("profiles").insert(profilePayload);
    if (profileError) {
      throw new Error(profileError.message);
    }

    if (role === "student" || role === "institute") {
      const establishedYear = role === "institute" ? parseOptionalNumber(text(form, "establishedYear")) : null;
      const totalStudents = role === "institute" ? parseOptionalNumber(text(form, "totalStudents")) : null;
      const totalStaff = role === "institute" ? parseOptionalNumber(text(form, "totalStaff")) : null;

      if (establishedYear !== null && (!Number.isInteger(establishedYear) || establishedYear < 1800 || establishedYear > 2100)) {
        return NextResponse.json({ error: "establishedYear must be a valid year" }, { status: 400 });
      }
      if (totalStudents !== null && (!Number.isInteger(totalStudents) || totalStudents < 0)) {
        return NextResponse.json({ error: "totalStudents must be a non-negative integer" }, { status: 400 });
      }
      if (totalStaff !== null && (!Number.isInteger(totalStaff) || totalStaff < 0)) {
        return NextResponse.json({ error: "totalStaff must be a non-negative integer" }, { status: 400 });
      }

      const detailsPayload = {
        user_id: createdUserId,
        alternate_phone: text(form, "alternatePhone") || null,
        dob: text(form, "dateOfBirth") || null,
        gender: text(form, "gender") || null,
        address_line_1: text(form, "addressLine1") || null,
        address_line_2: text(form, "addressLine2") || null,
        postal_code: text(form, "postalCode") || null,
        legal_entity_name: role === "institute" ? text(form, "legalEntityName") || null : null,
        registration_number: role === "institute" ? text(form, "registrationNumber") || null : null,
        accreditation_affiliation_number: role === "institute" ? text(form, "accreditationAffiliationNumber") || null : null,
        website_url: role === "institute" ? text(form, "websiteUrl") || null : null,
        established_year: establishedYear,
        total_students: totalStudents,
        total_staff: totalStaff,
      };

      const { error: detailsError } = await admin.data.from("user_additional_details").insert(detailsPayload);
      if (detailsError) {
        throw new Error(detailsError.message);
      }
    }

    let instituteId: string | null = null;

    if (role === "institute") {
      const { data: institute, error: instituteError } = await admin.data
        .from("institutes")
        .insert({
          user_id: createdUserId,
          name: text(form, "organizationName"),
          description: null,
          status: "pending",
        })
        .select("id")
        .single();

      if (instituteError || !institute) {
        throw new Error(instituteError?.message ?? "Failed to create institute record");
      }

      instituteId = institute.id;
    }

    const identityUpload = await uploadUserDocument({
      userId: createdUserId,
      file: identityDocument,
      category: "identity",
    });

    if (identityUpload.error) {
      throw new Error(identityUpload.error);
    }
    if (!identityUpload.path) {
      throw new Error("Failed to upload identity document");
    }

    uploadedPaths.push({ bucket: "userDocuments", path: identityUpload.path });

    const { error: identityDocError } = await admin.data.from("user_documents").insert({
      user_id: createdUserId,
      document_category: "identity",
      document_type: text(form, "identityDocumentType") || "government_id",
      document_url: identityUpload.path,
      status: "pending",
    });

    if (identityDocError) {
      throw new Error(identityDocError.message);
    }

    if (role === "institute" && instituteApprovalDocument instanceof File && instituteId) {
      const approvalUpload = await uploadInstituteDocument({
        userId: createdUserId,
        file: instituteApprovalDocument,
        type: "approval",
      });

      if (approvalUpload.error) {
        throw new Error(approvalUpload.error);
      }
      if (!approvalUpload.path) {
        throw new Error("Failed to upload institute approval document");
      }

      uploadedPaths.push({ bucket: "instituteDocuments", path: approvalUpload.path });

      const { error: instituteDocsError } = await admin.data.from("institute_documents").insert({
        institute_id: instituteId,
        document_url: approvalUpload.path,
        type: text(form, "instituteApprovalDocumentType") || "registration_certificate",
        status: "pending",
      });

      if (instituteDocsError) {
        throw new Error(instituteDocsError.message);
      }
    }

    if (role === "admin" && adminAuthorizationDocument instanceof File) {
      const authUpload = await uploadUserDocument({
        userId: createdUserId,
        file: adminAuthorizationDocument,
        category: "authorization",
      });

      if (authUpload.error) {
        throw new Error(authUpload.error);
      }
      if (!authUpload.path) {
        throw new Error("Failed to upload admin authorization document");
      }

      uploadedPaths.push({ bucket: "userDocuments", path: authUpload.path });

      const { error: authDocError } = await admin.data.from("user_documents").insert({
        user_id: createdUserId,
        document_category: "authorization",
        document_type: text(form, "adminAuthorizationDocumentType") || "authorization_letter",
        document_url: authUpload.path,
        status: "pending",
      });

      if (authDocError) {
        throw new Error(authDocError.message);
      }
    }

    return NextResponse.json({
      ok: true,
      message: "Registration submitted. Your account will be activated after admin approval.",
      redirectPath: "/auth/login?status=pending_approval",
    });
  } catch (error) {
    const admin = getSupabaseAdmin();
    if (admin.ok) {
      for (const uploaded of uploadedPaths) {
        await deleteFromBucket(STORAGE_BUCKETS[uploaded.bucket], uploaded.path);
      }

      if (createdUserId) {
        await admin.data.auth.admin.deleteUser(createdUserId);
      }
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to register" },
      { status: 500 }
    );
  }
}
