import { cn } from "@/lib/utils/cn";

const statusClassMap: Record<string, string> = {
  pending: "border-amber-200 bg-amber-50 text-amber-700",
  approved: "border-emerald-200 bg-emerald-50 text-emerald-700",
  rejected: "border-rose-200 bg-rose-50 text-rose-700",
  successful: "border-emerald-200 bg-emerald-50 text-emerald-700",
  failed: "border-rose-200 bg-rose-50 text-rose-700",
  scheduled: "border-sky-200 bg-sky-50 text-sky-700",
  live: "border-emerald-200 bg-emerald-50 text-emerald-700",
  completed: "border-slate-200 bg-slate-100 text-slate-700",
  cancelled: "border-rose-200 bg-rose-50 text-rose-700",
  registered: "border-sky-200 bg-sky-50 text-sky-700",
  attended: "border-emerald-200 bg-emerald-50 text-emerald-700",
  missed: "border-amber-200 bg-amber-50 text-amber-700",
  paid: "border-emerald-200 bg-emerald-50 text-emerald-700",
  refunded: "border-violet-200 bg-violet-50 text-violet-700",
  not_required: "border-slate-200 bg-slate-100 text-slate-700",
  granted: "border-emerald-200 bg-emerald-50 text-emerald-700",
  locked: "border-amber-200 bg-amber-50 text-amber-700",
  revoked: "border-rose-200 bg-rose-50 text-rose-700",
  confirmed: "border-emerald-200 bg-emerald-50 text-emerald-700",
  processing: "border-sky-200 bg-sky-50 text-sky-700",
  created: "border-slate-200 bg-slate-100 text-slate-700",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold capitalize tracking-wide",
        statusClassMap[status] ?? "border-slate-200 bg-slate-100 text-slate-700"
      )}
    >
      {status.replaceAll("_", " ")}
    </span>
  );
}
