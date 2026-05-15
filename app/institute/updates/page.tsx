import { requireUser } from "@/lib/auth/get-session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { StatusBadge } from "@/components/shared/status-badge";
import { InstituteUpdatesClient } from "@/components/institute/institute-updates-client";

export default async function InstituteUpdatesPage() {
  const { user } = await requireUser("institute", { requireApproved: false });
  const admin = getSupabaseAdmin(); if (!admin.ok) throw new Error(admin.error);
  const { data: institute } = await admin.data.from("institutes").select("id").eq("user_id", user.id).maybeSingle<{id:string}>();
  const { data: updates } = institute ? await admin.data.from("institute_updates").select("*").eq("institute_id", institute.id).order("created_at", { ascending: false }) : { data: [] };
  return <div className="vi-page"><h1 className="vi-page-title">Institute Updates</h1><InstituteUpdatesClient initialUpdates={updates ?? []} /></div>;
}
