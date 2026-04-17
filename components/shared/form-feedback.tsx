import { ReactNode } from "react";

type FeedbackTone = "error" | "success" | "info" | "warning";

const toneClasses: Record<FeedbackTone, string> = {
  error: "border-rose-200 bg-rose-50 text-rose-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  info: "border-sky-200 bg-sky-50 text-sky-700",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
};

export function FormFeedback({ tone, children }: { tone: FeedbackTone; children: ReactNode }) {
  return (
    <p role={tone === "error" ? "alert" : "status"} className={`rounded border px-3 py-2 text-sm ${toneClasses[tone]}`}>
      {children}
    </p>
  );
}
