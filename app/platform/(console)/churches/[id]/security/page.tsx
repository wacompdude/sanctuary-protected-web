import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { OrganizationMfaPolicyForm } from "@/components/platform/organization-mfa-policy-form";
import { PlatformChurchTabs } from "@/components/platform/platform-church-tabs";
import { PlatformMfaEmergencyBanner } from "@/components/platform/platform-mfa-emergency-banner";
import { PlatformStatusBadge } from "@/components/platform/platform-status-badge";
import { RequireMfaImmediatelyForm } from "@/components/platform/require-mfa-immediately-form";
import { getOrganizationMfaPolicyForAdmin } from "@/lib/mfa/admin-policy";
import { hasPlatformPermission } from "@/lib/platform/auth";
import { getPlatformChurchDetail } from "@/lib/platform/console-queries";

async function ChurchSecurityContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const church = await getPlatformChurchDetail(id);
  if (!church) notFound();

  const {
    platform,
    organization,
    policy,
    effectiveLabel,
    reasonLabel,
    emergencyOverrideActive,
  } = await getOrganizationMfaPolicyForAdmin(church.id);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/platform/churches/${church.id}`}
          className="text-sm text-slate-400 hover:text-amber-300"
        >
          ← {church.name}
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            Security — {church.name}
          </h1>
          <PlatformStatusBadge status={church.status} />
        </div>
        <p className="mt-1 text-sm text-slate-400">
          Controls whether users accessing this organization are required to
          complete MFA when platform-wide MFA is enabled.
        </p>
      </div>

      <PlatformChurchTabs
        churchId={church.id}
        active="security"
        showSecurity
      />

      {emergencyOverrideActive ? <PlatformMfaEmergencyBanner /> : null}

      <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-5 space-y-4">
        <h2 className="text-lg font-medium text-slate-100">
          Multi-Factor Authentication
        </h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-500">Organization MFA Policy</dt>
            <dd className="font-medium">
              {organization.mfaEnabled ? "ON" : "OFF"}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Platform MFA Policy</dt>
            <dd className="font-medium">{platform.mfaEnabled ? "ON" : "OFF"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Emergency Override</dt>
            <dd className={emergencyOverrideActive ? "font-semibold text-red-200" : ""}>
              {emergencyOverrideActive ? "ACTIVE" : "Inactive"}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Effective MFA</dt>
            <dd className="font-medium text-amber-200">
              {policy.required ? "REQUIRED" : "NOT REQUIRED"}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-slate-500">Reason</dt>
            <dd>{reasonLabel}</dd>
          </div>
        </dl>
        {policy.reason === "platform_disabled" ? (
          <p className="text-sm text-slate-400">
            Platform MFA is currently disabled. This organization&apos;s
            setting is preserved and will apply again when Platform MFA is
            turned on.
          </p>
        ) : null}
        <p className="sr-only">{effectiveLabel}</p>
        <OrganizationMfaPolicyForm
          organizationId={church.id}
          enabled={organization.mfaEnabled}
        />
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">
        <RequireMfaImmediatelyForm
          scope="organization"
          organizationId={church.id}
          emergencyOverrideActive={emergencyOverrideActive}
        />
      </section>
    </div>
  );
}

export default async function PlatformChurchSecurityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const canManage = await hasPlatformPermission("security.mfa_policy.manage");
  if (!canManage) notFound();

  return (
    <Suspense fallback={<div className="text-slate-400">Loading security…</div>}>
      <ChurchSecurityContent params={params} />
    </Suspense>
  );
}
