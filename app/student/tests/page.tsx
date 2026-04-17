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
