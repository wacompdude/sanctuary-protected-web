import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePlatformPermission } from "@/lib/platform/auth";
import { rethrowOrRedirectForPlatformAccess } from "@/lib/platform/access-guard";
import {
  getDemoOrganizationById,
  isDemoRestoreEligible,
} from "@/lib/platform/demo-snapshots/guardrails";
import { getActiveRestoreLock } from "@/lib/platform/demo-snapshots/locks";
import {
  DemoOrgFlagsForm,
  DemoRestoreLockTestForm,
} from "@/components/platform/demo-org-forms";

export default async function DemoOrganizationDetailPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  try {
    await requirePlatformPermission("demo_organizations.read");
  } catch (error) {
    rethrowOrRedirectForPlatformAccess(error);
  }

  const { organizationId } = await params;
  let org: Awaited<ReturnType<typeof getDemoOrganizationById>> = null;
  let lock: Awaited<ReturnType<typeof getActiveRestoreLock>> = null;
  let loadError: string | null = null;

  try {
    org = await getDemoOrganizationById(organizationId);
    if (org?.is_demo_organization) {
      lock = await getActiveRestoreLock(organizationId);
    }
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Unable to load.";
  }

  if (!loadError && (!org || !org.is_demo_organization)) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/platform/demo-organizations"
          className="text-sm text-slate-400 hover:text-slate-200"
        >
          ← Demo Churches
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          {org?.name ?? "Demo church"}
        </h1>
        <p className="mt-1 font-mono text-xs text-slate-500">{organizationId}</p>
      </div>

      {loadError ? (
        <div className="rounded-lg border border-amber-800/60 bg-amber-950/30 p-4 text-sm text-amber-100">
          {loadError}
        </div>
      ) : null}

      {org ? (
        <>
          <div className="grid gap-3 rounded-lg border border-slate-800 bg-slate-900/40 p-4 text-sm md:grid-cols-2">
            <div>
              <div className="text-slate-400">Restore eligible</div>
              <div className="font-medium text-slate-100">
                {isDemoRestoreEligible(org) ? "Yes" : "No"}
              </div>
            </div>
            <div>
              <div className="text-slate-400">Active lock</div>
              <div className="font-medium text-slate-100">
                {lock
                  ? `Until ${new Date(String(lock.expires_at)).toLocaleString()}`
                  : "None"}
              </div>
            </div>
            <div>
              <div className="text-slate-400">Seed source</div>
              <div className="font-mono text-xs text-slate-300">
                {org.seed_source || "—"}
              </div>
            </div>
            <div>
              <div className="text-slate-400">Snapshots</div>
              <div className="space-y-1 text-slate-300">
                <div>
                  <Link
                    href={`/platform/demo-organizations/${organizationId}/snapshots`}
                    className="text-sky-300 hover:text-sky-200"
                  >
                    View &amp; create versions
                  </Link>
                </div>
                <div>
                  <Link
                    href={`/platform/demo-organizations/${organizationId}/restore`}
                    className="text-sky-300 hover:text-sky-200"
                  >
                    Restore
                  </Link>
                  {" · "}
                  <Link
                    href={`/platform/demo-organizations/${organizationId}/restore-history`}
                    className="text-sky-300 hover:text-sky-200"
                  >
                    History
                  </Link>
                </div>
              </div>
            </div>
          </div>

          <DemoOrgFlagsForm org={org} />
          <DemoRestoreLockTestForm organizationId={org.id} />
        </>
      ) : null}
    </div>
  );
}
