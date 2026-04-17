import { cn } from "@/lib/utils/cn";

const statusClassMap: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-rose-100 text-rose-700",
  successful: "bg-emerald-100 text-emerald-700",
  failed: "bg-rose-100 text-rose-700",
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
