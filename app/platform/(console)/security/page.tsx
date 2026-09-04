import Link from "next/link";
import { Suspense } from "react";
import { OrganizationMfaPolicyForm } from "@/components/platform/organization-mfa-policy-form";
import { PlatformMfaEmergencyBanner } from "@/components/platform/platform-mfa-emergency-banner";
import { PlatformMfaPolicyForm } from "@/components/platform/platform-mfa-policy-form";
import { PlatformPagination } from "@/components/platform/platform-pagination";
import { PlatformStatusBadge } from "@/components/platform/platform-status-badge";
import { RequireMfaImmediatelyForm } from "@/components/platform/require-mfa-immediately-form";
import { MFA_POLICY_PAGE_SIZES } from "@/lib/mfa/admin-directory";
import { listOrganizationMfaPoliciesForAdmin } from "@/lib/mfa/admin-policy";
import {
  getDeployedEnvironmentLabel,
  isProductionEnvironment,
} from "@/lib/platform/environment";

async function SecurityContent({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; pageSize?: string }>;
}) {
  const params = await searchParams;
  const result = await listOrganizationMfaPoliciesForAdmin({
    q: params.q,
    page: params.page,
    pageSize: params.pageSize,
  });
  const environmentLabel = getDeployedEnvironmentLabel();

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-400">
          Platform → Security
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Multi-Factor Authentication
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Require MFA across the platform, then control it per organization.
          Disabling MFA never deletes enrollments or trusted devices.
        </p>
      </div>

      {result.emergencyOverrideActive ? <PlatformMfaEmergencyBanner /> : null}

      <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-5 space-y-6">
        <div>
          <h2 className="text-lg font-medium text-slate-100">Platform MFA</h2>
          <p className="mt-1 text-sm text-slate-400">
            Require MFA across the application.
          </p>
        </div>
        <PlatformMfaPolicyForm
          enabled={result.platformMfaEnabled}
          environmentLabel={environmentLabel}
          isProduction={isProductionEnvironment()}
          emergencyOverrideActive={result.emergencyOverrideActive}
        />
        <div className="border-t border-slate-800 pt-5">
          <RequireMfaImmediatelyForm
            scope="platform"
            emergencyOverrideActive={result.emergencyOverrideActive}
          />
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-medium text-slate-100">
            Organization MFA policies
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            Organization settings are preserved when Platform MFA is off.
          </p>
        </div>
        {!result.platformMfaEnabled && !result.emergencyOverrideActive ? (
          <p className="rounded-md border border-amber-700/60 bg-amber-950/30 px-3 py-2 text-sm text-amber-100">
            Platform MFA is currently disabled. Organization settings are
            preserved but are overridden by the Platform security policy.
          </p>
        ) : null}

        <form
          method="get"
          className="flex flex-col gap-3 rounded-lg border border-slate-800 bg-slate-900/40 p-4 sm:flex-row sm:items-end"
        >
          <label className="min-w-0 flex-1 text-sm">
            <span className="mb-1 block text-slate-400">Search organizations</span>
            <input
              name="q"
              defaultValue={result.q}
              placeholder="Search organizations..."
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
            />
          </label>
          <label className="text-sm sm:w-28">
            <span className="mb-1 block text-slate-400">Page size</span>
            <select
              name="pageSize"
              defaultValue={String(result.pageSize)}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
            >
              {MFA_POLICY_PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-amber-400"
          >
            Search
          </button>
        </form>

        <div className="overflow-x-auto rounded-lg border border-slate-800">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-900 text-slate-400">
              <tr>
                <th className="px-3 py-2 font-medium">Organization</th>
                <th className="px-3 py-2 font-medium">Policy</th>
                <th className="px-3 py-2 font-medium">Effective</th>
                <th className="px-3 py-2 font-medium">Reason</th>
                <th className="px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-slate-500">
                    {result.q
                      ? "No organizations match that search."
                      : "No organizations found."}
                  </td>
                </tr>
              ) : (
                result.rows.map((row) => (
                  <tr key={row.organizationId} className="border-t border-slate-800">
                    <td className="px-3 py-2">
                      <Link
                        href={`/platform/churches/${row.organizationId}/security`}
                        className="font-medium text-slate-100 hover:text-amber-300"
                      >
                        {row.name}
                      </Link>
                      {row.status ? (
                        <span className="ml-2 inline-block align-middle">
                          <PlatformStatusBadge status={row.status} />
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      {row.organizationMfaEnabled ? "ON" : "OFF"}
                    </td>
                    <td className="px-3 py-2 text-slate-300">
                      {row.policy.required ? "REQUIRED" : "NOT REQUIRED"}
                    </td>
                    <td className="px-3 py-2 text-slate-400">{row.reasonLabel}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <OrganizationMfaPolicyForm
                          organizationId={row.organizationId}
                          enabled={row.organizationMfaEnabled}
                          compact
                        />
                        <Link
                          href={`/platform/churches/${row.organizationId}/security`}
                          className="text-xs text-amber-300 hover:underline"
                        >
                          Manage
                        </Link>
                      </div>
                    </td>
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
          basePath="/platform/security"
          query={{
            q: result.q || undefined,
            pageSize:
              result.pageSize === 50 ? undefined : String(result.pageSize),
          }}
        />
      </section>
    </div>
  );
}

export default function PlatformSecurityPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; pageSize?: string }>;
}) {
  return (
    <Suspense fallback={<div className="text-slate-400">Loading security…</div>}>
      <SecurityContent searchParams={searchParams} />
    </Suspense>
  );
}
