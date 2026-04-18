import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { uploadAvatar } from "@/lib/storage/uploads";

function val(form: FormData, key: string) {
  return String(form.get(key) ?? "").trim();
}

function parseOptionalInt(value: string) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function parseOptionalDob(value: string) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return value;
}

export async function GET() {
  const auth = await requireApiUser();
  if ("error" in auth) return auth.error;

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const [{ data: profile, error: profileError }, { data: details, error: detailsError }, { data: institute, error: instituteError }] =
    await Promise.all([
      admin.data
        .from("profiles")
        .select("id,full_name,email,role,approval_status,phone,city,state,country,organization_name,organization_type,designation,avatar_url")
        .eq("id", auth.user.id)
        .maybeSingle(),
      admin.data
        .from("user_additional_details")
        .select("alternate_phone,dob,gender,address_line_1,address_line_2,postal_code")
        .eq("user_id", auth.user.id)
        .maybeSingle(),
      auth.profile.role === "institute"
        ? admin.data
            .from("institutes")
            .select(
              "id,name,description,status,rejection_reason,legal_entity_name,organization_type,registration_number,accreditation_affiliation_number,website_url,established_year,total_students,total_staff"
            )
            .eq("user_id", auth.user.id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });
  if (detailsError) return NextResponse.json({ error: detailsError.message }, { status: 500 });
  if (instituteError) return NextResponse.json({ error: instituteError.message }, { status: 500 });

  return NextResponse.json({ profile, details, institute });
}

export async function PATCH(request: Request) {
  const auth = await requireApiUser();
  if ("error" in auth) return auth.error;

  const supabase = await createClient();
  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const form = await request.formData();

  const nextEmail = val(form, "email").toLowerCase();
  const fullName = val(form, "fullName");

  if (!nextEmail || !fullName) {
    return NextResponse.json({ error: "fullName and email are required" }, { status: 400 });
  }

  if (nextEmail !== (auth.user.email ?? "").toLowerCase()) {
    const { error: emailError } = await supabase.auth.updateUser({ email: nextEmail });
    if (emailError) return NextResponse.json({ error: emailError.message }, { status: 400 });
  }

  const { error: metaError } = await supabase.auth.updateUser({
    data: {
      full_name: fullName,
      role: auth.profile.role,
    },
  });
  if (metaError) return NextResponse.json({ error: metaError.message }, { status: 400 });

  const profileUpdate = {
    name: fullName,
    full_name: fullName,
    email: nextEmail,
    phone: val(form, "phone") || null,
    city: val(form, "city") || null,
    state: val(form, "state") || null,
    country: val(form, "country") || null,
    organization_name: val(form, "organizationName") || null,
    organization_type: val(form, "organizationType") || null,
    designation: val(form, "designation") || null,
  };

  const avatarFile = form.get("avatar");
  if (avatarFile instanceof File && avatarFile.size > 0) {
    const uploadedAvatar = await uploadAvatar({ userId: auth.user.id, file: avatarFile });
    if (uploadedAvatar.error) {
      return NextResponse.json({ error: uploadedAvatar.error }, { status: 400 });
    }

    if (uploadedAvatar.publicUrl) {
      Object.assign(profileUpdate, { avatar_url: uploadedAvatar.publicUrl });
    }
  }

  const { error: profileError } = await admin.data.from("profiles").update(profileUpdate).eq("id", auth.user.id);
  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });

  if (auth.profile.role === "student" || auth.profile.role === "institute") {
    const dob = val(form, "dob");
    if (dob && !parseOptionalDob(dob)) {
      return NextResponse.json({ error: "dob must be a valid YYYY-MM-DD date" }, { status: 400 });
    }

    const detailsUpdate = {
      alternate_phone: val(form, "alternatePhone") || null,
      dob: parseOptionalDob(dob),
      gender: val(form, "gender") || null,
      address_line_1: val(form, "addressLine1") || null,
      address_line_2: val(form, "addressLine2") || null,
      postal_code: val(form, "postalCode") || null,
      updated_at: new Date().toISOString(),
    };

    const { error: detailsError } = await admin.data.from("user_additional_details").upsert(
      {
        user_id: auth.user.id,
        ...detailsUpdate,
      },
      { onConflict: "user_id" }
    );

    if (detailsError) return NextResponse.json({ error: detailsError.message }, { status: 500 });
  }

  if (auth.profile.role === "institute") {
    const establishedYear = parseOptionalInt(val(form, "establishedYear"));
    const totalStudents = parseOptionalInt(val(form, "totalStudents"));
    const totalStaff = parseOptionalInt(val(form, "totalStaff"));

    const currentYear = new Date().getUTCFullYear();
    if (val(form, "establishedYear") && (establishedYear === null || establishedYear < 1800 || establishedYear > currentYear)) {
      return NextResponse.json({ error: "establishedYear must be a valid year" }, { status: 400 });
    }

    if (val(form, "totalStudents") && (totalStudents === null || totalStudents < 0)) {
      return NextResponse.json({ error: "totalStudents must be a non-negative integer" }, { status: 400 });
    }

    if (val(form, "totalStaff") && (totalStaff === null || totalStaff < 0)) {
      return NextResponse.json({ error: "totalStaff must be a non-negative integer" }, { status: 400 });
    }

    const { error: instituteError } = await admin.data
      .from("institutes")
      .update({
        name: val(form, "instituteName") || val(form, "organizationName") || null,
        description: val(form, "description") || null,
        legal_entity_name: val(form, "legalEntityName") || null,
        organization_type: val(form, "organizationType") || null,
        registration_number: val(form, "registrationNumber") || null,
        accreditation_affiliation_number: val(form, "accreditationAffiliationNumber") || null,
        website_url: val(form, "websiteUrl") || null,
        established_year: establishedYear,
        total_students: totalStudents,
        total_staff: totalStaff,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", auth.user.id);

    if (instituteError) return NextResponse.json({ error: instituteError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
