import { InstituteCourseFeaturedPageClient } from "@/components/institute/course-featured-page";
import { requireUser } from "@/lib/auth/get-session";

export default async function InstituteCourseFeaturedPage() {
  await requireUser("institute", { requireApproved: false });
  return <InstituteCourseFeaturedPageClient />;
}
