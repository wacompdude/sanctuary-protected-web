import Link from "next/link";
import { notFound } from "next/navigation";
import { DemoRestoreForm } from "@/components/platform/demo-restore-form";
import { requirePlatformPermission } from "@/lib/platform/auth";
import { rethrowOrRedirectForPlatformAccess } from "@/lib/platform/access-guard";
import {
  getDemoOrganizationById,
  isDemoRestoreEligible,
} from "@/lib/platform/demo-snapshots/guardrails";
import { listDemoSnapshots } from "@/lib/platform/demo-snapshots/queries";

export const maxDuration = 300;

export default async function DemoRestorePage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationId: string }>;
  searchParams: Promise<{ snapshotId?: string }>;
}) {
  try {
    await requirePlatformPermission("demo_snapshots.restore");
  } catch (error) {
    rethrowOrRedirectForPlatformAccess(error);
  }

  const { organizationId } = await params;
  const { snapshotId } = await searchParams;

  let org: Awaited<ReturnType<typeof getDemoOrganizationById>> = null;
  let snapshots: Awaited<ReturnType<typeof listDemoSnapshots>> = [];
  let loadError: string | null = null;

  try {
    org = await getDemoOrganizationById(organizationId);
    if (org?.is_demo_organization) {
      snapshots = await listDemoSnapshots(organizationId);
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
          href={`/platform/demo-organizations/${organizationId}`}
          className="text-sm text-slate-400 hover:text-slate-200"
        >
          ← {org?.name ?? "Demo church"}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Restore demo church
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Preview impact, then confirm with MFA and the typed phrase. An automatic
          safety snapshot is taken before any destructive work.
        </p>
      </div>

      {loadError ? (
        <div className="rounded-lg border border-amber-800/60 bg-amber-950/30 p-4 text-sm text-amber-100">
          {loadError}
        </div>
      ) : null}

      {org && !isDemoRestoreEligible(org) ? (
        <div className="rounded-lg border border-rose-800/60 bg-rose-950/30 p-4 text-sm text-rose-100">
          Restore is not eligible right now (disabled or locked). Update demo
          guardrails before continuing.
        </div>
      ) : null}

      {org ? (
        <DemoRestoreForm
          organizationId={org.id}
          snapshots={snapshots}
          initialSnapshotId={snapshotId}
        />
      ) : null}
    </div>
  );
}
