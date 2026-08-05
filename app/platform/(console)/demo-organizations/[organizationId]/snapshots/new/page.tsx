import Link from "next/link";
import { notFound } from "next/navigation";
import { CreateDemoSnapshotForm } from "@/components/platform/demo-snapshot-forms";
import { requirePlatformPermission } from "@/lib/platform/auth";
import { rethrowOrRedirectForPlatformAccess } from "@/lib/platform/access-guard";
import { getDemoOrganizationById } from "@/lib/platform/demo-snapshots/guardrails";

export const maxDuration = 300;

export default async function NewDemoSnapshotPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  try {
    await requirePlatformPermission("demo_snapshots.create");
  } catch (error) {
    rethrowOrRedirectForPlatformAccess(error);
  }

  const { organizationId } = await params;
  const org = await getDemoOrganizationById(organizationId);
  if (!org?.is_demo_organization) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/platform/demo-organizations/${organizationId}/snapshots`}
          className="text-sm text-slate-400 hover:text-slate-200"
        >
          ← Snapshots
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          New snapshot
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Capture the current state of {org.name}.
        </p>
      </div>
      <CreateDemoSnapshotForm organizationId={organizationId} />
    </div>
  );
}
