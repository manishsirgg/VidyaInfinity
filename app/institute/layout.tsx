import type { ReactNode } from "react";

import { BackToDashboardButton } from "@/components/institute/back-to-dashboard-button";

export default function InstituteLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <BackToDashboardButton />
      {children}
    </>
  );
}
