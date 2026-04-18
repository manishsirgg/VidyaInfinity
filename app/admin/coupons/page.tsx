import { CouponManagement } from "@/components/admin/coupon-management";
import { requireUser } from "@/lib/auth/get-session";
import { createClient } from "@/lib/supabase/server";

export default async function Page() {
  await requireUser("admin");
  const supabase = await createClient();

  const { data: coupons } = await supabase
    .from("coupons")
    .select("id,code,discount_percentage,is_active,created_at,updated_at")
    .order("created_at", { ascending: false })
    .limit(200);

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-2xl font-semibold">Admin Coupons</h1>
      <p className="mt-2 text-sm text-slate-600">Create and control coupon activity used in psychometric test checkout flows.</p>
      <CouponManagement initialCoupons={coupons ?? []} />
    </div>
  );
}
