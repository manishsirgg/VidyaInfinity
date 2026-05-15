import { requireUser } from "@/lib/auth/get-session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { AdminInstituteUpdatesClient } from "@/components/admin/admin-institute-updates-client";

export default async function AdminInstituteUpdatesPage() {
  await requireUser("admin");
  const admin = getSupabaseAdmin(); if (!admin.ok) throw new Error(admin.error);
  const { data: updates } = await admin.data.from("institute_updates").select("*,institutes(name)").order("created_at", { ascending: false });
  return <div className="vi-page"><h1 className="vi-page-title">Admin Institute Updates</h1><AdminInstituteUpdatesClient initialUpdates={updates ?? []} /></div>;
}
