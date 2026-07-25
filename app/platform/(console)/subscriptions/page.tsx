import Link from "next/link";
import { Suspense } from "react";
import { PlatformPagination } from "@/components/platform/platform-pagination";
import { PlatformStatusBadge } from "@/components/platform/platform-status-badge";
import { listCurrentSubscriptions } from "@/lib/platform/console-queries";

async function SubscriptionsContent({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const result = await listCurrentSubscriptions({
    page: Number(params.page || "1"),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Active subscriptions
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Current subscription rows (trialing, active, past due, grace,
          incomplete).
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-800">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-900 text-slate-400">
            <tr>
              <th className="px-3 py-2 font-medium">Church</th>
              <th className="px-3 py-2 font-medium">Plan</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {result.items.map((item) => (
              <tr key={item.id} className="border-t border-slate-800">
                <td className="px-3 py-2">
                  <Link
                    href={`/platform/churches/${item.churchId}`}
                    className="text-amber-300 hover:underline"
                  >
                    {item.churchName}
                  </Link>
                </td>
                <td className="px-3 py-2">{item.planDisplayName}</td>
                <td className="px-3 py-2">
                  <PlatformStatusBadge status={item.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <PlatformPagination
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
        basePath="/platform/subscriptions"
      />
    </div>
  );
}

export default function PlatformSubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  return (
    <Suspense
      fallback={<div className="text-slate-400">Loading subscriptions…</div>}
    >
      <SubscriptionsContent searchParams={searchParams} />
    </Suspense>
  );
}
