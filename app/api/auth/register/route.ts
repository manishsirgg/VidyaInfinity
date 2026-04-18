import { NextResponse } from "next/server";

import { isInstituteApprovalDocumentSubtype } from "@/lib/constants/institute-documents";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  STORAGE_BUCKETS,
  deleteFromBucket,
  uploadAvatar,
  uploadInstituteDocument,
  uploadUserDocument,
} from "@/lib/storage/uploads";

type RegisterRole = "student" | "institute" | "admin";
type UploadRef = {
  bucket: keyof Pick<typeof STORAGE_BUCKETS, "userDocuments" | "instituteDocuments" | "avatars">;
  path: string;
};

function text(form: FormData, key: string) {
  return String(form.get(key) ?? "").trim();
}

function parseOptionalInteger(value: string) {
  if (!value) return null;
  if (!/^-?\d+$/.test(value)) return null;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function isIsoDate(value: string) {
  if (!value) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function missing(...fields: Array<[string, string]>) {
  return fields.filter(([, value]) => !value).map(([name]) => name);
}

function mapErrorStatus(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("duplicate") || normalized.includes("already registered") || normalized.includes("already exists")) {
    return 409;
  }
  if (normalized.includes("invalid") || normalized.includes("required")) {
    return 400;
  }
  return 500;
}

function countWords(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}

async function cleanupFailure(uploadedPaths: UploadRef[], createdUserId: string | null) {
  const admin = getSupabaseAdmin();
  if (!admin.ok) return;

  for (const uploaded of uploadedPaths) {
    await deleteFromBucket(STORAGE_BUCKETS[uploaded.bucket], uploaded.path);
  }

  if (createdUserId) {
    await admin.data.auth.admin.deleteUser(createdUserId);
  }
}

export async function POST(request: Request) {
  const uploadedPaths: UploadRef[] = [];
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
    const phone = text(form, "phone");

    const missingCore = missing(
      ["fullName", fullName],
      ["email", email],
      ["password", password],
      ["phone", phone]
    );

    if (missingCore.length > 0) {
      return NextResponse.json({ error: `Missing required fields: ${missingCore.join(", ")}` }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }

    const city = text(form, "city");
    const state = text(form, "state");
    const country = text(form, "country");

    if (role === "student" || role === "institute") {
      const dateOfBirth = text(form, "dateOfBirth");
      const gender = text(form, "gender");
      const addressLine1 = text(form, "addressLine1");
      const postalCode = text(form, "postalCode");

      const roleMissing = missing(
        ["dateOfBirth", dateOfBirth],
        ["gender", gender],
        ["addressLine1", addressLine1],
        ["city", city],
        ["state", state],
        ["country", country],
        ["postalCode", postalCode]
      );

      if (roleMissing.length > 0) {
        return NextResponse.json({ error: `Missing required fields: ${roleMissing.join(", ")}` }, { status: 400 });
      }

      if (!isIsoDate(dateOfBirth)) {
        return NextResponse.json({ error: "dateOfBirth must be a valid YYYY-MM-DD date" }, { status: 400 });
      }
    }

    if (role === "admin") {
      const designation = text(form, "designation");
      const roleMissing = missing(
        ["designation", designation],
        ["city", city],
        ["state", state],
        ["country", country]
      );
      if (roleMissing.length > 0) {
        return NextResponse.json({ error: `Missing required fields: ${roleMissing.join(", ")}` }, { status: 400 });
      }
    }

    if (role === "institute") {
      const organizationName = text(form, "organizationName");
      const organizationType = text(form, "organizationType");
      const designation = text(form, "designation");
      const description = text(form, "description");

      const roleMissing = missing(
        ["organizationName", organizationName],
        ["organizationType", organizationType],
        ["designation", designation]
      );

      if (roleMissing.length > 0) {
        return NextResponse.json({ error: `Missing required fields: ${roleMissing.join(", ")}` }, { status: 400 });
      }

      if (countWords(description) > 2500) {
        return NextResponse.json({ error: "Institute description must not exceed 2500 words" }, { status: 400 });
      }
    }

    const identityDocumentType = text(form, "identityDocumentType");
    const identityDocument = form.get("identityDocument");
    if (!identityDocumentType || !(identityDocument instanceof File) || identityDocument.size === 0) {
      return NextResponse.json({ error: "Identity document type and file are required" }, { status: 400 });
    }

    const adminAuthorizationDocumentType = text(form, "adminAuthorizationDocumentType");
    const adminAuthorizationDocument = form.get("adminAuthorizationDocument");
    if (
      role === "admin" &&
      (!adminAuthorizationDocumentType || !(adminAuthorizationDocument instanceof File) || adminAuthorizationDocument.size === 0)
    ) {
      return NextResponse.json({ error: "Admin authorization document type and file are required" }, { status: 400 });
    }

    const instituteApprovalDocumentType = text(form, "instituteApprovalDocumentType");
    const instituteApprovalDocument = form.get("instituteApprovalDocument");
    if (
      role === "institute" &&
      (!instituteApprovalDocumentType || !(instituteApprovalDocument instanceof File) || instituteApprovalDocument.size === 0)
    ) {
      return NextResponse.json({ error: "Institute approval document type and file are required" }, { status: 400 });
    }
    if (role === "institute" && !isInstituteApprovalDocumentSubtype(instituteApprovalDocumentType)) {
      return NextResponse.json({ error: "Invalid institute approval document type" }, { status: 400 });
    }

    const establishedYear = parseOptionalInteger(text(form, "establishedYear"));
    const totalStudents = parseOptionalInteger(text(form, "totalStudents"));
    const totalStaff = parseOptionalInteger(text(form, "totalStaff"));
    const instituteName = text(form, "organizationName");
    const instituteOrganizationType = text(form, "organizationType");

    if (role === "institute") {
      const yearNow = new Date().getUTCFullYear();
      if (text(form, "establishedYear") && (establishedYear === null || establishedYear < 1800 || establishedYear > yearNow)) {
        return NextResponse.json({ error: "establishedYear must be a valid year" }, { status: 400 });
      }
      if (text(form, "totalStudents") && (totalStudents === null || totalStudents < 0)) {
        return NextResponse.json({ error: "totalStudents must be a non-negative integer" }, { status: 400 });
      }
      if (text(form, "totalStaff") && (totalStaff === null || totalStaff < 0)) {
        return NextResponse.json({ error: "totalStaff must be a non-negative integer" }, { status: 400 });
      }
    }

    const admin = getSupabaseAdmin();
    if (!admin.ok) {
      return NextResponse.json({ error: admin.error }, { status: 500 });
    }

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
    let avatarUrl: string | null = null;

    const avatar = form.get("avatar");
    if (avatar instanceof File && avatar.size > 0) {
      const avatarUpload = await uploadAvatar({ userId: createdUserId, file: avatar });
      if (avatarUpload.error || !avatarUpload.path) {
        throw new Error(avatarUpload.error ?? "Failed to upload avatar");
      }
      uploadedPaths.push({ bucket: "avatars", path: avatarUpload.path });
      avatarUrl = avatarUpload.publicUrl ?? null;
    }

    const { error: profileError } = await admin.data.from("profiles").insert({
      id: createdUserId,
      name: fullName,
      full_name: fullName,
      email,
      role,
      approval_status: "pending",
      phone,
      city: city || null,
      state: state || null,
      country: country || null,
      designation: role === "admin" || role === "institute" ? text(form, "designation") || null : null,
      organization_name: role === "institute" ? instituteName || null : null,
      organization_type: role === "institute" ? instituteOrganizationType || null : null,
      avatar_url: avatarUrl,
    });

    if (profileError) throw new Error(profileError.message);

    if (role === "student" || role === "institute") {
      const { error: detailsError } = await admin.data.from("user_additional_details").insert({
        user_id: createdUserId,
        alternate_phone: text(form, "alternatePhone") || null,
        dob: text(form, "dateOfBirth") || null,
        gender: text(form, "gender") || null,
        address_line_1: text(form, "addressLine1") || null,
        address_line_2: text(form, "addressLine2") || null,
        postal_code: text(form, "postalCode") || null,
      });

      if (detailsError) throw new Error(detailsError.message);
    }

    let instituteId: string | null = null;

    if (role === "institute") {
      const { data: institute, error: instituteError } = await admin.data
        .from("institutes")
        .insert({
          user_id: createdUserId,
          name: instituteName,
          status: "pending",
          verified: false,
          legal_entity_name: text(form, "legalEntityName") || null,
          organization_type: instituteOrganizationType || null,
          registration_number: text(form, "registrationNumber") || null,
          accreditation_affiliation_number: text(form, "accreditationAffiliationNumber") || null,
          website_url: text(form, "websiteUrl") || null,
          description: text(form, "description") || null,
          established_year: establishedYear,
          total_students: totalStudents,
          total_staff: totalStaff,
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

    if (identityUpload.error || !identityUpload.path) {
      throw new Error(identityUpload.error ?? "Failed to upload identity document");
    }

    uploadedPaths.push({ bucket: "userDocuments", path: identityUpload.path });

    const { error: identityDocError } = await admin.data.from("user_documents").insert({
      user_id: createdUserId,
      document_category: "identity",
      document_type: identityDocumentType,
      document_url: identityUpload.path,
      status: "pending",
    });

    if (identityDocError) throw new Error(identityDocError.message);

    if (role === "admin" && adminAuthorizationDocument instanceof File) {
      const authorizationUpload = await uploadUserDocument({
        userId: createdUserId,
        file: adminAuthorizationDocument,
        category: "authorization",
      });

      if (authorizationUpload.error || !authorizationUpload.path) {
        throw new Error(authorizationUpload.error ?? "Failed to upload admin authorization document");
      }

      uploadedPaths.push({ bucket: "userDocuments", path: authorizationUpload.path });

      const { error: authorizationError } = await admin.data.from("user_documents").insert({
        user_id: createdUserId,
        document_category: "authorization",
        document_type: adminAuthorizationDocumentType,
        document_url: authorizationUpload.path,
        status: "pending",
      });

      if (authorizationError) throw new Error(authorizationError.message);
    }

    if (role === "institute" && instituteApprovalDocument instanceof File && instituteId) {
      const approvalUpload = await uploadInstituteDocument({
        userId: createdUserId,
        file: instituteApprovalDocument,
        type: "approval",
      });

      if (approvalUpload.error || !approvalUpload.path) {
        throw new Error(approvalUpload.error ?? "Failed to upload institute approval document");
      }

      uploadedPaths.push({ bucket: "instituteDocuments", path: approvalUpload.path });

      const { error: instituteDocError } = await admin.data.from("institute_documents").insert({
        institute_id: instituteId,
        document_url: approvalUpload.path,
        type: "approval",
        subtype: instituteApprovalDocumentType,
        status: "pending",
      });

      if (instituteDocError) throw new Error(instituteDocError.message);
    }

    return NextResponse.json({
      ok: true,
      message: "Registration submitted. Your account will be activated after admin approval.",
      redirectPath: "/auth/login?status=pending_approval",
    });
  } catch (error) {
    await cleanupFailure(uploadedPaths, createdUserId);

    const message = error instanceof Error ? error.message : "Unable to register";
    return NextResponse.json({ error: message }, { status: mapErrorStatus(message) });
  }
}
