import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PlatformChurchTabs } from "@/components/platform/platform-church-tabs";
import { PlatformStatusBadge } from "@/components/platform/platform-status-badge";
import { PlatformSupportSessionForm } from "@/components/platform/platform-support-session-form";
import { getPlatformChurchDetail } from "@/lib/platform/console-queries";
import {
  hasPlatformPermission,
  requirePlatformConsoleAccess,
} from "@/lib/platform/auth";
import { getActivePlatformSupportSession } from "@/lib/platform/support-sessions";

async function ChurchDetailContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const church = await getPlatformChurchDetail(id);
  if (!church) notFound();

  const canReadSubs = await hasPlatformPermission("subscriptions.read_all");
  const canSupport = await hasPlatformPermission("churches.support_access");
  const canManageMfaPolicy = await hasPlatformPermission(
    "security.mfa_policy.manage",
  );
  const context = canSupport ? await requirePlatformConsoleAccess() : null;
  const activeSupport = context
    ? await getActivePlatformSupportSession(context)
    : null;
  const activeForThisChurch =
    activeSupport && activeSupport.organization_id === church.id
      ? activeSupport
      : null;

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Link
          href="/platform/churches"
          className="text-sm text-slate-400 hover:text-amber-300"
        >
          ← All churches
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{church.name}</h1>
          <PlatformStatusBadge status={church.status} />
        </div>
        <p className="text-sm text-slate-400">
          {church.slug ? `URL name: ${church.slug}` : "No URL name"} ·{" "}
          {church.timezone || "No timezone"} · {church.memberCount} members ·{" "}
          {church.campusCount} campuses
        </p>
      </div>

      <PlatformChurchTabs
        churchId={church.id}
        active="overview"
        showSecurity={canManageMfaPolicy}
      />

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
          <h2 className="text-sm font-medium text-slate-300">Subscription</h2>
          {church.subscription ? (
            <div className="mt-3 space-y-2 text-sm">
              <p>
                <span className="text-slate-500">Plan: </span>
                {church.subscription.planDisplayName}
              </p>
              <p className="flex items-center gap-2">
                <span className="text-slate-500">Status:</span>
                <PlatformStatusBadge status={church.subscription.status} />
              </p>
              <p>
                <span className="text-slate-500">Period end: </span>
                {church.subscription.currentPeriodEnd
                  ? new Date(
                      church.subscription.currentPeriodEnd,
                    ).toLocaleString()
                  : "—"}
              </p>
              {canReadSubs ? (
                <Link
                  href={`/platform/churches/${church.id}/subscription`}
                  className="inline-block text-amber-300 hover:underline"
                >
                  View subscription details
                </Link>
              ) : null}
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-500">
              No current subscription row.
            </p>
          )}
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
          <h2 className="text-sm font-medium text-slate-300">Quick counts</h2>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-slate-500">Members</dt>
              <dd className="text-xl font-semibold">{church.memberCount}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Campuses</dt>
              <dd className="text-xl font-semibold">{church.campusCount}</dd>
            </div>
          </dl>
        </div>
      </section>

      {canSupport ? (
        <PlatformSupportSessionForm
          organizationId={church.id}
          churchName={church.name}
          canStart
          activeSessionId={activeForThisChurch?.id ?? null}
        />
      ) : null}
    </div>
  );
}

export default function PlatformChurchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<div className="text-slate-400">Loading church…</div>}>
      <ChurchDetailContent params={params} />
    </Suspense>
  );
}
