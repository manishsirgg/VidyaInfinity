import { requireUser } from "@/lib/auth/get-session";

export default async function InstituteDashboardPage() {
  await requireUser("institute");
  return <div className="mx-auto max-w-6xl px-4 py-12 text-2xl font-semibold">Institute Dashboard</div>;
}
