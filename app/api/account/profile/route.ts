import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { uploadAvatar } from "@/lib/storage/uploads";

function val(form: FormData, key: string) {
  return String(form.get(key) ?? "").trim();
}

export async function GET() {
  const auth = await requireApiUser();
  if ("error" in auth) return auth.error;

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const profileWithAvatar = await admin.data
    .from("profiles")
    .select("id,full_name,email,role,approval_status,phone,city,state,country,organization_name,organization_type,designation,avatar_url")
    .eq("id", auth.user.id)
    .maybeSingle();

  const profileFallback = profileWithAvatar.error
    ? await admin.data
        .from("profiles")
        .select("id,full_name,email,role,approval_status,phone,city,state,country,organization_name,organization_type,designation")
        .eq("id", auth.user.id)
        .maybeSingle()
    : null;

  const profile = profileWithAvatar.data ?? profileFallback?.data ?? null;
  const profileError = profileWithAvatar.error ?? profileFallback?.error ?? null;

  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });

  const institute =
    auth.profile.role === "institute"
      ? (await admin.data.from("institutes").select("*").eq("user_id", auth.user.id).maybeSingle()).data
      : null;

  return NextResponse.json({ profile, institute });
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

  if (nextEmail !== auth.user.email) {
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

  const profileUpdateBase = {
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
  let avatarUrl: string | null = null;
  let avatarPath: string | null = null;

  if (avatarFile instanceof File && avatarFile.size > 0) {
    const uploadedAvatar = await uploadAvatar({ userId: auth.user.id, file: avatarFile });
    if (uploadedAvatar.error) {
      return NextResponse.json({ error: uploadedAvatar.error }, { status: 400 });
    }

    avatarUrl = uploadedAvatar.publicUrl ?? null;
    avatarPath = uploadedAvatar.path ?? null;
  }

  const profileUpdateWithAvatar = avatarUrl
    ? {
        ...profileUpdateBase,
        avatar_url: avatarUrl,
      }
    : profileUpdateBase;

  const profileUpdateWithAvatarAndPath =
    avatarUrl && avatarPath
      ? {
          ...profileUpdateWithAvatar,
          avatar_storage_path: avatarPath,
        }
      : profileUpdateWithAvatar;

  let { error: profileError } = await admin.data.from("profiles").update(profileUpdateWithAvatarAndPath).eq("id", auth.user.id);

  if (
    profileError &&
    avatarUrl &&
    avatarPath &&
    /column\s+profiles\.avatar_storage_path\s+does\s+not\s+exist/i.test(profileError.message)
  ) {
    ({ error: profileError } = await admin.data.from("profiles").update(profileUpdateWithAvatar).eq("id", auth.user.id));
  }

  if (profileError && avatarUrl && /column\s+profiles\.avatar_url\s+does\s+not\s+exist/i.test(profileError.message)) {
    ({ error: profileError } = await admin.data.from("profiles").update(profileUpdateBase).eq("id", auth.user.id));
  }

  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });

  if (auth.profile.role === "institute") {
    const instituteUpdate = {
      name: val(form, "instituteName") || val(form, "organizationName") || null,
      legal_name: val(form, "legalName") || null,
      institute_type: val(form, "organizationType") || null,
      registration_number: val(form, "registrationNumber") || null,
      accreditation_number: val(form, "accreditationNumber") || null,
      website_url: val(form, "websiteUrl") || null,
      established_year: val(form, "establishedYear") ? Number(val(form, "establishedYear")) : null,
      city: val(form, "city") || null,
      state: val(form, "state") || null,
      country: val(form, "country") || null,
      contact_email: nextEmail,
      contact_phone: val(form, "phone") || null,
      authorized_person_name: fullName,
      authorized_person_designation: val(form, "designation") || null,
      student_strength: val(form, "studentStrength") ? Number(val(form, "studentStrength")) : null,
      staff_strength: val(form, "staffStrength") ? Number(val(form, "staffStrength")) : null,
      description: val(form, "description") || null,
    };

    const { error: instituteError } = await admin.data.from("institutes").update(instituteUpdate).eq("user_id", auth.user.id);
    if (instituteError) return NextResponse.json({ error: instituteError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
