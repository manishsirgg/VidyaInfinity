import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { isInstituteApprovalDocumentSubtype } from "@/lib/constants/institute-documents";
import { createAccountNotification } from "@/lib/notifications/account-notifications";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getPublicFileUrl, uploadAvatar, uploadInstituteDocument, uploadInstituteMedia, uploadUserDocument } from "@/lib/storage/uploads";
import { sendModerationExternalNotifications } from "@/lib/integrations/account-moderation";

function val(form: FormData, key: string) {
  return String(form.get(key) ?? "").trim();
}

function parseOptionalInt(value: string) {
  if (!value) return null;
  if (!/^-?\d+$/.test(value)) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseOptionalDob(value: string) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return value;
}

function countWords(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}

function isMissingNotificationsTableError(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  const message = String(error.message ?? "").toLowerCase();
  return error.code === "42P01" || (message.includes("notifications") && message.includes("does not exist"));
}

export async function GET() {
  const auth = await requireApiUser(undefined, { requireApproved: false });
  if ("error" in auth) return auth.error;

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const [
    { data: profile, error: profileError },
    { data: details, error: detailsError },
    { data: institute, error: instituteError },
    { data: userDocuments, error: userDocumentsError },
    { data: notifications, error: notificationsError },
  ] = await Promise.all([
    admin.data
      .from("profiles")
      .select("id,full_name,email,role,approval_status,rejection_reason,phone,city,state,country,organization_name,organization_type,designation,avatar_url")
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
    admin.data
      .from("user_documents")
      .select("id,document_category,document_type,status,rejection_reason,created_at")
      .eq("user_id", auth.user.id)
      .order("created_at", { ascending: false }),
    admin.data
      .from("notifications")
      .select("id,title,message,type,is_read,created_at")
      .eq("user_id", auth.user.id)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });
  if (detailsError) return NextResponse.json({ error: detailsError.message }, { status: 500 });
  if (instituteError) return NextResponse.json({ error: instituteError.message }, { status: 500 });
  if (userDocumentsError) return NextResponse.json({ error: userDocumentsError.message }, { status: 500 });

  if (notificationsError && !isMissingNotificationsTableError(notificationsError)) {
    return NextResponse.json({ error: notificationsError.message }, { status: 500 });
  }

  let instituteDocuments: Array<{ id: string; type: string; subtype: string | null; status: string; created_at: string }> = [];
  let instituteMedia: Array<{
    id: string;
    file_url: string;
    media_type: string;
    file_name: string | null;
    file_size: number | null;
    created_at: string;
  }> = [];

  if (auth.profile.role === "institute" && institute?.id) {
    const [{ data, error }, { data: media, error: mediaError }] = await Promise.all([
      admin.data
        .from("institute_documents")
        .select("id,type,subtype,status,created_at")
        .eq("institute_id", institute.id)
        .order("created_at", { ascending: false }),
      admin.data
        .from("institute_media")
        .select("id,file_url,media_type,file_name,file_size,created_at")
        .eq("institute_id", institute.id)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (mediaError) {
      return NextResponse.json({ error: mediaError.message }, { status: 500 });
    }

    instituteDocuments = data ?? [];
    instituteMedia = media ?? [];
  }

  return NextResponse.json({
    profile,
    details,
    institute,
    userDocuments: userDocuments ?? [],
    instituteDocuments,
    notifications: notificationsError ? [] : (notifications ?? []),
    notificationsAvailable: !Boolean(notificationsError),
    instituteMedia:
      auth.profile.role === "institute"
        ? (instituteMedia ?? []).map((media) => ({
            ...media,
            publicUrl: getPublicFileUrl({ bucket: "institute-media", path: media.file_url }) ?? getPublicFileUrl({ bucket: "blog-media", path: media.file_url }),
          }))
        : [],
  });
}


export async function PATCH(request: Request) {
  const auth = await requireApiUser(undefined, { requireApproved: false });
  if ("error" in auth) return auth.error;

  const supabase = await createClient();
  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const form = await request.formData();

  const resubmit = val(form, "resubmit") === "true";
  let uploadedIdentityDocument = false;
  let uploadedAuthorizationDocument = false;
  let uploadedInstituteDocument = false;
  const nextEmail = val(form, "email").toLowerCase();
  const fullName = val(form, "fullName");
  const organizationType = val(form, "organizationType");
  const instituteName = val(form, "instituteName");
  const organizationName = val(form, "organizationName");

  if (!nextEmail || !fullName) {
    return NextResponse.json({ error: "fullName and email are required" }, { status: 400 });
  }

  if (auth.profile.role === "institute") {
    if (!instituteName) {
      return NextResponse.json({ error: "instituteName is required for institute profiles" }, { status: 400 });
    }
    if (!organizationName) {
      return NextResponse.json({ error: "organizationName is required for institute profiles" }, { status: 400 });
    }
    if (!organizationType) {
      return NextResponse.json({ error: "organizationType is required for institute profiles" }, { status: 400 });
    }
  }

  const dob = val(form, "dob");
  if ((auth.profile.role === "student" || auth.profile.role === "institute") && dob && !parseOptionalDob(dob)) {
    return NextResponse.json({ error: "dob must be a valid YYYY-MM-DD date" }, { status: 400 });
  }

  const establishedYear = parseOptionalInt(val(form, "establishedYear"));
  const totalStudents = parseOptionalInt(val(form, "totalStudents"));
  const totalStaff = parseOptionalInt(val(form, "totalStaff"));

  if (auth.profile.role === "institute") {
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

    if (countWords(val(form, "description")) > 2500) {
      return NextResponse.json({ error: "Institute description must not exceed 2500 words" }, { status: 400 });
    }
  }

  const mediaFiles = form.getAll("instituteMedia").filter((item): item is File => item instanceof File && item.size > 0);
  if (auth.profile.role !== "institute" && mediaFiles.length > 0) {
    return NextResponse.json({ error: "Institute media uploads are only available for institute accounts" }, { status: 400 });
  }
  if (mediaFiles.length > 8) {
    return NextResponse.json({ error: "You can upload up to 8 institute media files at once" }, { status: 400 });
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

  const profileUpdate: Record<string, string | null> = {
    name: fullName,
    full_name: fullName,
    email: nextEmail,
    phone: val(form, "phone") || null,
    city: val(form, "city") || null,
    state: val(form, "state") || null,
    country: val(form, "country") || null,
    organization_name: organizationName || null,
    organization_type: organizationType || null,
    designation: val(form, "designation") || null,
  };

  if (resubmit) {
    profileUpdate.approval_status = "pending";
    profileUpdate.rejection_reason = null;
  }

  const avatarFile = form.get("avatar");
  if (avatarFile instanceof File && avatarFile.size > 0) {
    const uploadedAvatar = await uploadAvatar({ userId: auth.user.id, file: avatarFile });
    if (uploadedAvatar.error) {
      return NextResponse.json({ error: uploadedAvatar.error }, { status: 400 });
    }

    if (uploadedAvatar.publicUrl) {
      profileUpdate.avatar_url = uploadedAvatar.publicUrl;
    }
  }

  const identityDocument = form.get("identityDocument");
  const identityDocumentType = val(form, "identityDocumentType");
  if (identityDocument instanceof File && identityDocument.size > 0) {
    if (!identityDocumentType) {
      return NextResponse.json({ error: "identityDocumentType is required when uploading identityDocument" }, { status: 400 });
    }

    const identityUpload = await uploadUserDocument({ userId: auth.user.id, file: identityDocument, category: "identity" });
    if (identityUpload.error || !identityUpload.path) {
      return NextResponse.json({ error: identityUpload.error ?? "Unable to upload identity document" }, { status: 400 });
    }

    const { error: docInsertError } = await admin.data.from("user_documents").insert({
      user_id: auth.user.id,
      document_category: "identity",
      document_type: identityDocumentType,
      document_url: identityUpload.path,
      status: "pending",
      rejection_reason: null,
    });

    if (docInsertError) return NextResponse.json({ error: docInsertError.message }, { status: 500 });

    uploadedIdentityDocument = true;
  }

  const authorizationDocument = form.get("adminAuthorizationDocument");
  const authorizationType = val(form, "adminAuthorizationDocumentType");
  if (authorizationDocument instanceof File && authorizationDocument.size > 0) {
    if (!authorizationType) {
      return NextResponse.json({ error: "adminAuthorizationDocumentType is required when uploading adminAuthorizationDocument" }, { status: 400 });
    }

    const authorizationUpload = await uploadUserDocument({ userId: auth.user.id, file: authorizationDocument, category: "authorization" });
    if (authorizationUpload.error || !authorizationUpload.path) {
      return NextResponse.json({ error: authorizationUpload.error ?? "Unable to upload authorization document" }, { status: 400 });
    }

    const { error: docInsertError } = await admin.data.from("user_documents").insert({
      user_id: auth.user.id,
      document_category: "authorization",
      document_type: authorizationType,
      document_url: authorizationUpload.path,
      status: "pending",
      rejection_reason: null,
    });

    if (docInsertError) return NextResponse.json({ error: docInsertError.message }, { status: 500 });

    uploadedAuthorizationDocument = true;
  }

  const { error: profileError } = await admin.data.from("profiles").update(profileUpdate).eq("id", auth.user.id);
  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });

  if (auth.profile.role === "student" || auth.profile.role === "institute") {
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
    const { data: institute, error: instituteLookupError } = await admin.data
      .from("institutes")
      .select("id")
      .eq("user_id", auth.user.id)
      .maybeSingle<{ id: string }>();

    if (instituteLookupError || !institute) {
      return NextResponse.json({ error: instituteLookupError?.message ?? "Institute record not found" }, { status: 500 });
    }

    const instituteApprovalDocument = form.get("instituteApprovalDocument");
    const instituteApprovalDocumentType = val(form, "instituteApprovalDocumentType");
    if (instituteApprovalDocument instanceof File && instituteApprovalDocument.size > 0) {
      if (!instituteApprovalDocumentType) {
        return NextResponse.json({ error: "instituteApprovalDocumentType is required when uploading instituteApprovalDocument" }, { status: 400 });
      }
      if (!isInstituteApprovalDocumentSubtype(instituteApprovalDocumentType)) {
        return NextResponse.json({ error: "Invalid instituteApprovalDocumentType" }, { status: 400 });
      }

      const approvalUpload = await uploadInstituteDocument({
        userId: auth.user.id,
        file: instituteApprovalDocument,
        type: "approval",
      });

      if (approvalUpload.error || !approvalUpload.path) {
        return NextResponse.json({ error: approvalUpload.error ?? "Unable to upload institute document" }, { status: 400 });
      }

      const { error: instituteDocInsertError } = await admin.data.from("institute_documents").insert({
        institute_id: institute.id,
        type: "approval",
        subtype: instituteApprovalDocumentType,
        document_url: approvalUpload.path,
        status: "pending",
      });

      if (instituteDocInsertError) return NextResponse.json({ error: instituteDocInsertError.message }, { status: 500 });

      uploadedInstituteDocument = true;
    }

    if (mediaFiles.length > 0) {
      const { count: existingMediaCount, error: mediaCountError } = await admin.data
        .from("institute_media")
        .select("id", { head: true, count: "exact" })
        .eq("institute_id", institute.id);

      if (mediaCountError) {
        return NextResponse.json({ error: mediaCountError.message }, { status: 500 });
      }

      const totalAfterUpload = (existingMediaCount ?? 0) + mediaFiles.length;
      if (totalAfterUpload > 20) {
        return NextResponse.json({ error: "Institute showcase supports up to 20 media files in total" }, { status: 400 });
      }

      for (const mediaFile of mediaFiles) {
        const isImage = mediaFile.type.startsWith("image/");
        const isVideo = mediaFile.type.startsWith("video/");

        if (!isImage && !isVideo) {
          return NextResponse.json({ error: "Only image and video files are allowed for institute media" }, { status: 400 });
        }

        const maxSize = isImage ? 5 * 1024 * 1024 : 20 * 1024 * 1024;
        if (mediaFile.size > maxSize) {
          return NextResponse.json(
            { error: `${mediaFile.name} exceeds max ${(maxSize / 1024 / 1024).toFixed(0)}MB for ${isImage ? "images" : "videos"}` },
            { status: 400 }
          );
        }

        const uploadedMedia = await uploadInstituteMedia({ userId: auth.user.id, file: mediaFile });
        if (uploadedMedia.error || !uploadedMedia.path) {
          return NextResponse.json({ error: uploadedMedia.error ?? "Unable to upload institute media file" }, { status: 400 });
        }

        const { error: mediaInsertError } = await admin.data.from("institute_media").insert({
          institute_id: institute.id,
          file_url: uploadedMedia.path,
          media_type: isImage ? "image" : "video",
          file_name: mediaFile.name,
          file_size: mediaFile.size,
        });

        if (mediaInsertError) {
          return NextResponse.json({ error: mediaInsertError.message }, { status: 500 });
        }
      }
    }

    const instituteUpdate: Record<string, string | number | null | boolean> = {
      name: instituteName || null,
      description: val(form, "description") || null,
      legal_entity_name: val(form, "legalEntityName") || null,
      organization_type: organizationType || null,
      registration_number: val(form, "registrationNumber") || null,
      accreditation_affiliation_number: val(form, "accreditationAffiliationNumber") || null,
      website_url: val(form, "websiteUrl") || null,
      established_year: establishedYear,
      total_students: totalStudents,
      total_staff: totalStaff,
      updated_at: new Date().toISOString(),
    };

    if (resubmit) {
      instituteUpdate.status = "pending";
      instituteUpdate.rejection_reason = null;
      instituteUpdate.verified = false;
    }

    const { error: instituteError } = await admin.data.from("institutes").update(instituteUpdate).eq("user_id", auth.user.id);

    if (instituteError) return NextResponse.json({ error: instituteError.message }, { status: 500 });

    if (resubmit && !uploadedInstituteDocument) {
      const { data: latestInstituteDoc, error: instituteDocLookupError } = await admin.data
        .from("institute_documents")
        .select("id")
        .eq("institute_id", institute.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<{ id: string }>();

      if (instituteDocLookupError) {
        return NextResponse.json({ error: instituteDocLookupError.message }, { status: 500 });
      }

      if (latestInstituteDoc?.id) {
        const { error: instituteDocResetError } = await admin.data
          .from("institute_documents")
          .update({ status: "pending" })
          .eq("id", latestInstituteDoc.id);

        if (instituteDocResetError) {
          return NextResponse.json({ error: instituteDocResetError.message }, { status: 500 });
        }
      }
    }
  }

  if (resubmit) {
    if (!uploadedIdentityDocument) {
      const { data: latestIdentityDoc, error: identityLookupError } = await admin.data
        .from("user_documents")
        .select("id")
        .eq("user_id", auth.user.id)
        .eq("document_category", "identity")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<{ id: string }>();

      if (identityLookupError) {
        return NextResponse.json({ error: identityLookupError.message }, { status: 500 });
      }

      if (latestIdentityDoc?.id) {
        const { error: identityResetError } = await admin.data
          .from("user_documents")
          .update({ status: "pending", rejection_reason: null })
          .eq("id", latestIdentityDoc.id);

        if (identityResetError) {
          return NextResponse.json({ error: identityResetError.message }, { status: 500 });
        }
      }
    }

    if (auth.profile.role === "admin" && !uploadedAuthorizationDocument) {
      const { data: latestAuthorizationDoc, error: authorizationLookupError } = await admin.data
        .from("user_documents")
        .select("id")
        .eq("user_id", auth.user.id)
        .eq("document_category", "authorization")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<{ id: string }>();

      if (authorizationLookupError) {
        return NextResponse.json({ error: authorizationLookupError.message }, { status: 500 });
      }

      if (latestAuthorizationDoc?.id) {
        const { error: authorizationResetError } = await admin.data
          .from("user_documents")
          .update({ status: "pending", rejection_reason: null })
          .eq("id", latestAuthorizationDoc.id);

        if (authorizationResetError) {
          return NextResponse.json({ error: authorizationResetError.message }, { status: 500 });
        }
      }
    }

    await createAccountNotification({
      userId: auth.user.id,
      type: "resubmission",
      title: "Resubmission received",
      message: "Your account was moved back to pending review. Admin will review the latest updates.",
    });

    await sendModerationExternalNotifications({
      userId: auth.user.id,
      role: auth.profile.role,
      event: "resubmitted",
      userEmail: nextEmail,
      userPhone: val(form, "phone") || null,
      userName: fullName,
    });
  }

  return NextResponse.json({ ok: true, resubmitted: resubmit });
}
