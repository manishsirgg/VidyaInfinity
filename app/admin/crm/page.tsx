import { AdminCrmDashboard } from "@/components/admin/admin-crm-dashboard";
import { requireUser } from "@/lib/auth/get-session";

export default async function Page() {
  await requireUser("admin");

  return <AdminCrmDashboard />;
}
