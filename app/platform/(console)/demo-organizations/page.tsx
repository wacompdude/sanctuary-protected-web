import Link from "next/link";
import { requirePlatformPermission } from "@/lib/platform/auth";
import { rethrowOrRedirectForPlatformAccess } from "@/lib/platform/access-guard";
import {
  findOrganizationBySeedSource,
  listDemoOrganizations,
} from "@/lib/platform/demo-snapshots/guardrails";
import { DEMO_SEED_SOURCE } from "@/lib/demo-seed/constants";
import { MarkFirstChurchDemoForm } from "@/components/platform/demo-org-forms";

export default async function DemoOrganizationsPage() {
  try {
    await requirePlatformPermission("demo_organizations.read");
  } catch (error) {
    rethrowOrRedirectForPlatformAccess(error);
  }

  let orgs: Awaited<ReturnType<typeof listDemoOrganizations>> = [];
  let loadError: string | null = null;
  let seedOrg: { id: string; name: string } | null = null;

  try {
    orgs = await listDemoOrganizations();
    const found = await findOrganizationBySeedSource(DEMO_SEED_SOURCE);
    if (found) seedOrg = { id: found.id, name: found.name };
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Unable to load.";
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Demo Churches</h1>
        <p className="mt-1 text-sm text-slate-400">
          Snapshot and restore targets. Only organizations with the hard demo
          flag appear here — never identified by name alone.
        </p>
      </div>

      {loadError ? (
        <div className="rounded-lg border border-amber-800/60 bg-amber-950/30 p-4 text-sm text-amber-100">
          {loadError}
        </div>
      ) : null}

      {orgs.length === 0 && !loadError ? (
        <div className="space-y-4 rounded-lg border border-slate-800 bg-slate-900/40 p-4">
          <p className="text-sm text-slate-300">
            No demo churches are flagged yet. After migrations 080–081, mark the
            First Church seed organization below.
          </p>
          {seedOrg ? (
            <p className="text-xs text-slate-500">
              Seed match: {seedOrg.name} ({seedOrg.id})
            </p>
          ) : (
            <p className="text-xs text-slate-500">
              No organization with seed_source={DEMO_SEED_SOURCE}. Run Demo seed
              first.
            </p>
          )}
          <MarkFirstChurchDemoForm disabled={!seedOrg} />
        </div>
      ) : null}

      {orgs.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900/80 text-slate-400">
              <tr>
                <th className="px-3 py-2 font-medium">Church</th>
                <th className="px-3 py-2 font-medium">Environment</th>
                <th className="px-3 py-2 font-medium">Restore</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {orgs.map((org) => (
                <tr
                  key={org.id}
                  className="border-t border-slate-800/80 hover:bg-slate-900/40"
                >
                  <td className="px-3 py-2">
                    <Link
                      href={`/platform/demo-organizations/${org.id}`}
                      className="font-medium text-sky-300 hover:underline"
                    >
                      {org.name}
                    </Link>
                    <div className="font-mono text-xs text-slate-500">
                      {org.id}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-slate-300">
                    {org.demo_environment_label || "—"}
                  </td>
                  <td className="px-3 py-2 text-slate-300">
                    {org.demo_restore_enabled
                      ? org.demo_restore_locked
                        ? "Locked"
                        : "Enabled"
                      : "Disabled"}
                  </td>
                  <td className="px-3 py-2 text-slate-300">
                    {org.demo_maintenance_mode ? "Maintenance" : org.status || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
