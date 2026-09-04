import Link from "next/link";

export function PlatformPagination({
  page,
  pageSize,
  total,
  basePath,
  query,
}: {
  page: number;
  pageSize: number;
  total: number;
  basePath: string;
  query?: Record<string, string | undefined>;
}) {
  const totalPages = Math.max(1, Math.ceil(Math.max(total, 1) / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  function hrefFor(nextPage: number) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value && key !== "page") params.set(key, value);
    }
    if (nextPage > 1) params.set("page", String(nextPage));
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  }

  return (
    <div className="flex flex-col gap-3 pt-4 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between">
      <p>
        {total === 0
          ? "Showing 0 of 0"
          : `Showing ${from}–${to} of ${total}`}
        {totalPages > 1 ? ` · Page ${page} of ${totalPages}` : null}
      </p>
      {totalPages > 1 ? (
        <div className="flex gap-2">
          {page > 1 ? (
            <Link
              href={hrefFor(page - 1)}
              className="rounded border border-slate-700 px-3 py-1.5 hover:bg-slate-900"
            >
              Previous
            </Link>
          ) : null}
          {page < totalPages ? (
            <Link
              href={hrefFor(page + 1)}
              className="rounded border border-slate-700 px-3 py-1.5 hover:bg-slate-900"
            >
              Next
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
