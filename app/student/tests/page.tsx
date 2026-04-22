import Link from "next/link";

import { requireUser } from "@/lib/auth/get-session";
import { createClient } from "@/lib/supabase/server";
import { getSignedPrivateFileUrl } from "@/lib/storage/uploads";

export default async function Page() {
  const { user } = await requireUser("student");
  const supabase = await createClient();

  const { data: attempts } = await supabase
    .from("test_attempts")
    .select("id,test_id,status,started_at,completed_at,score,report_url")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const { data: paidOrders } = await supabase
    .from("psychometric_orders")
    .select("id,test_id,paid_at")
    .eq("user_id", user.id)
    .eq("payment_status", "paid")
    .order("paid_at", { ascending: false });

  const orderTestIds = Array.from(new Set((paidOrders ?? []).map((order) => order.test_id).filter(Boolean)));
  const { data: tests } = orderTestIds.length
    ? await supabase.from("psychometric_tests").select("id,title,slug").in("id", orderTestIds)
    : { data: [] as { id: string; title: string; slug: string }[] };
  const testById = new Map((tests ?? []).map((item) => [item.id, item]));

  const attemptsWithReportLinks = await Promise.all(
    (attempts ?? []).map(async (attempt) => ({
      ...attempt,
      report_link: attempt.report_url
        ? await getSignedPrivateFileUrl({
            bucket: "psychometric-reports",
            fileRef: attempt.report_url,
          })
        : null,
    }))
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-2xl font-semibold">Student Tests</h1>
      <div className="mt-4 space-y-2">
        {(paidOrders ?? []).map((order) => (
          <div key={order.id} className="rounded border bg-emerald-50 p-3 text-sm">
            Unlocked: {testById.get(order.test_id)?.title ?? order.test_id} · Paid: {order.paid_at ? new Date(order.paid_at).toLocaleString() : "-"} ·{" "}
            <Link href={testById.get(order.test_id)?.slug ? `/psychometric-tests/${testById.get(order.test_id)?.slug}` : "/psychometric-tests"} className="text-brand-600">
              Open test
            </Link>
          </div>
        ))}
      </div>
      <div className="mt-4 space-y-2">
        {attemptsWithReportLinks.map((attempt) => (
          <div key={attempt.id} className="rounded border bg-white p-3 text-sm">
            Test {attempt.test_id} · {attempt.status} · score {attempt.score ?? "-"}
            {attempt.report_link && (
              <div>
                <Link href={attempt.report_link} className="text-brand-600" target="_blank">
                  View Report
                </Link>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
