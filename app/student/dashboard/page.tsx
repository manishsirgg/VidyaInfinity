import { requireUser } from "@/lib/auth/get-session";

export default async function StudentDashboardPage() {
  await requireUser("student");
  return <div className="mx-auto max-w-6xl px-4 py-12 text-2xl font-semibold">Student Dashboard</div>;
}
