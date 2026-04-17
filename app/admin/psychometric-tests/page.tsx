import { requireUser } from "@/lib/auth/get-session";

export default async function Page() {
  await requireUser("admin");
  return <div className="mx-auto max-w-6xl px-4 py-12 text-2xl font-semibold">Admin Psychometric-tests</div>;
}
