import { cn } from "@/lib/utils/cn";

const statusClassMap: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-rose-100 text-rose-700",
  successful: "bg-emerald-100 text-emerald-700",
  failed: "bg-rose-100 text-rose-700",
  scheduled: "bg-sky-100 text-sky-700",
  live: "bg-emerald-100 text-emerald-700",
  completed: "bg-slate-200 text-slate-700",
  cancelled: "bg-rose-100 text-rose-700",
  registered: "bg-sky-100 text-sky-700",
  attended: "bg-emerald-100 text-emerald-700",
  missed: "bg-amber-100 text-amber-700",
  paid: "bg-emerald-100 text-emerald-700",
  refunded: "bg-violet-100 text-violet-700",
  not_required: "bg-slate-200 text-slate-700",
  granted: "bg-emerald-100 text-emerald-700",
  locked: "bg-amber-100 text-amber-700",
  revoked: "bg-rose-100 text-rose-700",
  confirmed: "bg-emerald-100 text-emerald-700",
  processing: "bg-sky-100 text-sky-700",
  created: "bg-slate-200 text-slate-700",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-3 py-1 text-xs font-medium capitalize",
        statusClassMap[status] ?? "bg-slate-200 text-slate-700"
      )}
    >
      {status.replaceAll("_", " ")}
    </span>
  );
}
