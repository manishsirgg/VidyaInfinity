import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { uploadToBucket } from "@/lib/storage/uploads";

function toSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function parseOptionalNumber(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();

    const role = String(form.get("role") ?? "").trim() as "student" | "institute" | "admin";
    const fullName = String(form.get("fullName") ?? "").trim();
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    const password = String(form.get("password") ?? "");

    if (!role || !["student", "institute", "admin"].includes(role)) {
      return NextResponse.json({ error: "Valid role is required" }, { status: 400 });
    }

    if (!fullName || !email || !password) {
      return NextResponse.json({ error: "fullName, email and password are required" }, { status: 400 });
    }

    const identityDocument = form.get("identityDocument");
    const approvalDocument = form.get("approvalDocument");

    if (!(identityDocument instanceof File)) {
      return NextResponse.json({ error: "Identity document is required" }, { status: 400 });
    }

    if ((role === "institute" || role === "admin") && !(approvalDocument instanceof File)) {
      return NextResponse.json(
        { error: "Institute/Admin approval document is required for selected role" },
        { status: 400 }
      );
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

    const userId = signUp.data.user.id;
    const profilePayload = {
      id: userId,
      full_name: fullName,
      email,
      role,
      approval_status: "pending",
      phone: String(form.get("phone") ?? "").trim() || null,
      alternate_phone: String(form.get("alternatePhone") ?? "").trim() || null,
      date_of_birth: String(form.get("dateOfBirth") ?? "").trim() || null,
      gender: String(form.get("gender") ?? "").trim() || null,
      address_line1: String(form.get("addressLine1") ?? "").trim() || null,
      address_line2: String(form.get("addressLine2") ?? "").trim() || null,
      city: String(form.get("city") ?? "").trim() || null,
      state: String(form.get("state") ?? "").trim() || null,
      country: String(form.get("country") ?? "").trim() || null,
      postal_code: String(form.get("postalCode") ?? "").trim() || null,
      organization_name: String(form.get("organizationName") ?? "").trim() || null,
      organization_type: String(form.get("organizationType") ?? "").trim() || null,
      designation: String(form.get("designation") ?? "").trim() || null,
    };

    const { error: profileError } = await admin.data.from("profiles").upsert(profilePayload);
    if (profileError) {
      await admin.data.auth.admin.deleteUser(userId);
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    if (role === "institute") {
      const instituteName = String(form.get("organizationName") ?? "").trim();
      if (!instituteName) {
        await admin.data.auth.admin.deleteUser(userId);
        return NextResponse.json({ error: "organizationName is required for institute registration" }, { status: 400 });
      }

      const { error: instituteError } = await admin.data.from("institutes").insert({
        user_id: userId,
        name: instituteName,
        legal_name: String(form.get("legalName") ?? "").trim() || instituteName,
        institute_type: String(form.get("organizationType") ?? "").trim() || null,
        slug: `${toSlug(instituteName)}-${userId.slice(0, 8)}`,
        city: String(form.get("city") ?? "").trim() || null,
        state: String(form.get("state") ?? "").trim() || null,
        country: String(form.get("country") ?? "").trim() || null,
        address_line1: String(form.get("addressLine1") ?? "").trim() || null,
        address_line2: String(form.get("addressLine2") ?? "").trim() || null,
        postal_code: String(form.get("postalCode") ?? "").trim() || null,
        registration_number: String(form.get("registrationNumber") ?? "").trim() || null,
        accreditation_number: String(form.get("accreditationNumber") ?? "").trim() || null,
        website_url: String(form.get("websiteUrl") ?? "").trim() || null,
        established_year: parseOptionalNumber(form.get("establishedYear")),
        contact_email: email,
        contact_phone: String(form.get("phone") ?? "").trim() || null,
        authorized_person_name: fullName,
        authorized_person_designation: String(form.get("designation") ?? "").trim() || null,
        student_strength: parseOptionalNumber(form.get("studentStrength")),
        staff_strength: parseOptionalNumber(form.get("staffStrength")),
        metadata: {
          registration_context: "central_register_form",
        },
        approval_status: "pending",
      });

      if (instituteError) {
        await admin.data.auth.admin.deleteUser(userId);
        return NextResponse.json({ error: instituteError.message }, { status: 500 });
      }
    }

    const identityUpload = await uploadToBucket({
      bucket: "institute-documents",
      file: identityDocument,
      ownerId: userId,
      folder: "identity",
    });

    if (identityUpload.error) {
      await admin.data.auth.admin.deleteUser(userId);
      return NextResponse.json({ error: identityUpload.error }, { status: 400 });
    }

    const docsToInsert = [
      {
        user_id: userId,
        role,
        document_category: "identity",
        document_type: String(form.get("identityDocumentType") ?? "government_id") || "government_id",
        document_url: identityUpload.publicUrl,
        storage_path: identityUpload.path,
      },
    ];

    if (approvalDocument instanceof File) {
      const approvalUpload = await uploadToBucket({
        bucket: "institute-documents",
        file: approvalDocument,
        ownerId: userId,
        folder: role === "admin" ? "admin-authorization" : "organization-approval",
      });

      if (approvalUpload.error) {
        await admin.data.auth.admin.deleteUser(userId);
        return NextResponse.json({ error: approvalUpload.error }, { status: 400 });
      }

      docsToInsert.push({
        user_id: userId,
        role,
        document_category: role === "admin" ? "admin_authorization" : "organization_approval",
        document_type:
          String(form.get("approvalDocumentType") ?? "authorization_letter") || "authorization_letter",
        document_url: approvalUpload.publicUrl,
        storage_path: approvalUpload.path,
      });

      if (role === "institute") {
        const { data: institute } = await admin.data
          .from("institutes")
          .select("id")
          .eq("user_id", userId)
          .maybeSingle();

        if (institute?.id) {
          await admin.data.from("institute_documents").insert({
            institute_id: institute.id,
            document_type: String(form.get("approvalDocumentType") ?? "registration_certificate") || "registration_certificate",
            document_url: approvalUpload.publicUrl,
            storage_path: approvalUpload.path,
            verification_status: "pending",
          });
        }
      }
    }

    const { error: docsError } = await admin.data.from("user_verification_documents").insert(docsToInsert);
    if (docsError) {
      await admin.data.auth.admin.deleteUser(userId);
      return NextResponse.json({ error: docsError.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      message: "Registration submitted. Your account will be activated after admin approval.",
      redirectPath: "/auth/login?status=pending_approval",
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to register" },
      { status: 500 }
    );
  }
}
