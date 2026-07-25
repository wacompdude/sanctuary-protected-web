import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PlatformStatusBadge } from "@/components/platform/platform-status-badge";
import { getPlatformChurchDetail } from "@/lib/platform/console-queries";

async function MembersContent({
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
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Members</h1>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-800">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-900 text-slate-400">
            <tr>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Role</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {church.members.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-3 py-6 text-slate-500">
                  No active members.
                </td>
              </tr>
            ) : (
              church.members.map((member) => (
                <tr key={member.id} className="border-t border-slate-800">
                  <td className="px-3 py-2">
                    {member.full_name || member.user_id}
                  </td>
                  <td className="px-3 py-2 capitalize">
                    {member.role.replaceAll("_", " ")}
                  </td>
                  <td className="px-3 py-2">
                    <PlatformStatusBadge status={member.status} />
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

export default function PlatformChurchMembersPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<div className="text-slate-400">Loading members…</div>}>
      <MembersContent params={params} />
    </Suspense>
  );
}
