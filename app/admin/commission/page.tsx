import { CommissionForm } from "@/components/admin/commission-form";
import { requireUser } from "@/lib/auth/get-session";
import { createClient } from "@/lib/supabase/server";

export default async function Page() {
  await requireUser("admin");
  const supabase = await createClient();

  const { data: settings } = await supabase
    .from("platform_commission_settings")
    .select("commission_percentage")
    .eq("key", "default")
    .maybeSingle();

  const current = Number(settings?.commission_percentage ?? 12);

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-2xl font-semibold">Admin Commission</h1>
      <CommissionForm currentValue={current} />
    </div>
  );
}
