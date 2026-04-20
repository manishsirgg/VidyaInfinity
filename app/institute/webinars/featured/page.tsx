import { InstituteWebinarFeaturedPageClient } from "@/components/institute/webinar-featured-page";
import { requireUser } from "@/lib/auth/get-session";

export default async function InstituteWebinarFeaturedPage() {
  await requireUser("institute", { requireApproved: false });
  return <InstituteWebinarFeaturedPageClient />;
}
