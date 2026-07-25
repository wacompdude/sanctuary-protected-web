import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PlatformStatusBadge } from "@/components/platform/platform-status-badge";
import { getPlatformChurchDetail } from "@/lib/platform/console-queries";

async function CampusesContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const church = await getPlatformChurchDetail(id);
  if (!church) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/platform/churches/${church.id}`}
          className="text-sm text-slate-400 hover:text-amber-300"
        >
          ← {church.name}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Campuses</h1>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-800">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-900 text-slate-400">
            <tr>
              <th className="px-3 py-2 font-medium">Campus</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {church.campuses.length === 0 ? (
              <tr>
                <td colSpan={2} className="px-3 py-6 text-slate-500">
                  No campuses.
                </td>
              </tr>
            ) : (
              church.campuses.map((campus) => (
                <tr key={campus.id} className="border-t border-slate-800">
                  <td className="px-3 py-2">{campus.name}</td>
                  <td className="px-3 py-2">
                    <PlatformStatusBadge status={campus.status} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function PlatformChurchCampusesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense
      fallback={<div className="text-slate-400">Loading campuses…</div>}
    >
      <CampusesContent params={params} />
    </Suspense>
  );
}
