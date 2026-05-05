import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/get-session";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Page() {
  await requireUser("student");
  redirect("/student/purchases?kind=psychometric");
}
