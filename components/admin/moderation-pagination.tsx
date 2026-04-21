import Link from "next/link";

type ModerationPaginationProps = {
  page: number;
  pageSize: number;
  totalItems: number;
  pathname: string;
  query?: Record<string, string | undefined>;
};

function buildHref(pathname: string, query: Record<string, string | undefined>, page: number) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (!value || key === "page") continue;
    params.set(key, value);
  }
  if (page > 1) {
    params.set("page", String(page));
  }
  const search = params.toString();
  return search ? `${pathname}?${search}` : pathname;
}

export function ModerationPagination({ page, pageSize, totalItems, pathname, query = {} }: ModerationPaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  if (totalPages <= 1) return null;

  const safePage = Math.min(Math.max(page, 1), totalPages);
  const startItem = (safePage - 1) * pageSize + 1;
  const endItem = Math.min(safePage * pageSize, totalItems);

  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3.5 text-sm shadow-sm">
      <p className="text-slate-600">
        Showing <span className="font-medium text-slate-800">{startItem}-{endItem}</span> of <span className="font-medium text-slate-800">{totalItems}</span>
      </p>
      <div className="flex items-center gap-2">
        <Link
          href={buildHref(pathname, query, safePage - 1)}
          className={`vi-btn-secondary px-3 py-1.5 ${safePage <= 1 ? "pointer-events-none opacity-50" : ""}`}
        >
          Previous
        </Link>
        <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-slate-700">
          Page {safePage} of {totalPages}
        </span>
        <Link
          href={buildHref(pathname, query, safePage + 1)}
          className={`vi-btn-secondary px-3 py-1.5 ${safePage >= totalPages ? "pointer-events-none opacity-50" : ""}`}
        >
          Next
        </Link>
      </div>
    </div>
  );
}
