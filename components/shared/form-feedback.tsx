import { AlertCircle, CheckCircle2, Info, TriangleAlert } from "lucide-react";
import { ReactNode } from "react";

type FeedbackTone = "error" | "success" | "info" | "warning";

const toneClasses: Record<FeedbackTone, string> = {
  error: "border-rose-200 bg-rose-50/90 text-rose-800",
  success: "border-emerald-200 bg-emerald-50/90 text-emerald-800",
  info: "border-sky-200 bg-sky-50/90 text-sky-800",
  warning: "border-amber-200 bg-amber-50/90 text-amber-900",
};

const toneIcon: Record<FeedbackTone, typeof AlertCircle> = {
  error: AlertCircle,
  success: CheckCircle2,
  info: Info,
  warning: TriangleAlert,
};

export function FormFeedback({ tone, children }: { tone: FeedbackTone; children: ReactNode }) {
  const Icon = toneIcon[tone];

  return (
    <p role={tone === "error" ? "alert" : "status"} className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm ${toneClasses[tone]}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
