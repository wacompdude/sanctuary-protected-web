import Link from "next/link";
import { Suspense } from "react";
import { PlatformPagination } from "@/components/platform/platform-pagination";
import { PlatformStatusBadge } from "@/components/platform/platform-status-badge";
import { listPlatformChurches } from "@/lib/platform/console-queries";
import { PLAN_KEY_LIST } from "@/lib/subscriptions/plan-keys";

async function ChurchesContent({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    plan?: string;
    page?: string;
  }>;
}) {
  const params = await searchParams;
  const page = Number(params.page || "1");
  const result = await listPlatformChurches({
    q: params.q,
    status: params.status,
    planKey: params.plan,
    page,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Churches</h1>
        <p className="mt-1 text-sm text-slate-400">
          Cross-tenant church directory for platform operators.
        </p>
      </div>

      <form
        method="get"
        className="grid gap-3 rounded-lg border border-slate-800 bg-slate-900/40 p-4 md:grid-cols-4"
      >
        <label className="text-sm md:col-span-2">
          <span className="mb-1 block text-slate-400">Search</span>
          <input
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Church name"
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-400">Status</span>
          <select
            name="status"
            defaultValue={params.status ?? "all"}
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
          >
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="trial">Trial</option>
            <option value="suspended">Suspended</option>
            <option value="closed">Closed</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-400">Plan</span>
          <select
            name="plan"
            defaultValue={params.plan ?? "all"}
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
          >
            <option value="all">All</option>
            {PLAN_KEY_LIST.map((key) => (
              <option key={key} value={key}>
                {key}
              </option>
            ))}
          </select>
        </label>
        <div className="md:col-span-4">
          <button
            type="submit"
            className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-amber-400"
          >
            Apply filters
          </button>
        </div>
      </form>

      <div className="overflow-x-auto rounded-lg border border-slate-800">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-900 text-slate-400">
            <tr>
              <th className="px-3 py-2 font-medium">Church</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Plan</th>
              <th className="px-3 py-2 font-medium">Subscription</th>
              <th className="px-3 py-2 font-medium">Members</th>
              <th className="px-3 py-2 font-medium">Campuses</th>
            </tr>
          </thead>
          <tbody>
            {result.items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-slate-500">
                  No churches matched these filters.
                </td>
              </tr>
            ) : (
              result.items.map((church) => (
                <tr key={church.id} className="border-t border-slate-800">
                  <td className="px-3 py-2">
                    <Link
                      href={`/platform/churches/${church.id}`}
                      className="font-medium text-amber-300 hover:underline"
                    >
                      {church.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <PlatformStatusBadge status={church.status} />
                  </td>
                  <td className="px-3 py-2 text-slate-300">
                    {church.planDisplayName ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    <PlatformStatusBadge status={church.subscriptionStatus} />
                  </td>
                  <td className="px-3 py-2">{church.memberCount}</td>
                  <td className="px-3 py-2">{church.campusCount}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <PlatformPagination
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
        basePath="/platform/churches"
        query={{
          q: params.q,
          status: params.status,
          plan: params.plan,
        }}
      />
    </div>
  );
}

export default function PlatformChurchesPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    plan?: string;
    page?: string;
  }>;
}) {
  return (
    <Suspense fallback={<div className="text-slate-400">Loading churches…</div>}>
      <ChurchesContent searchParams={searchParams} />
    </Suspense>
  );
}
