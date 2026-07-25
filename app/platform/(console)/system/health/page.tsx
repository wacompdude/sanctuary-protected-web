import { Suspense } from "react";
import { PlatformStatusBadge } from "@/components/platform/platform-status-badge";
import { getPlatformHealthStatus } from "@/lib/platform/console-queries";

async function HealthContent() {
  const health = await getPlatformHealthStatus();
  const { getPlatformProviderConfigStatus } = await import(
    "@/lib/platform/system-status"
  );
  let configSummary: {
    billingConfigured: boolean;
    emailConfigured: boolean;
    resendSecretConfigured: boolean;
  } | null = null;
  try {
    const config = await getPlatformProviderConfigStatus();
    configSummary = {
      billingConfigured: config.billing.configured,
      emailConfigured: config.email.configured,
      resendSecretConfigured: config.webhooks.resendSecretConfigured,
    };
  } catch {
    configSummary = null;
  }

  const rows = [
    { label: "Environment", value: health.environment },
    {
      label: "Commit",
      value: health.commit ? health.commit.slice(0, 10) : "—",
    },
    {
      label: "Service role",
      value: health.serviceRoleConfigured ? "Configured" : "Not configured",
      status: health.serviceRoleConfigured ? "active" : "suspended",
    },
    { label: "Billing provider", value: health.billingProvider },
    { label: "Email provider", value: health.emailProvider },
    {
      label: "Platform tables",
      value: health.platformTablesReachable ? "Healthy" : "Failed",
      status: health.platformTablesReachable ? "active" : "suspended",
    },
    {
      label: "Super admin role seeded",
      value: health.superAdminRoleSeeded ? "Yes" : "No",
      status: health.superAdminRoleSeeded ? "active" : "suspended",
    },
    ...(configSummary
      ? [
          {
            label: "Billing adapter ready",
            value: configSummary.billingConfigured ? "Yes" : "No",
            status: configSummary.billingConfigured ? "active" : "suspended",
          },
          {
            label: "Email provider ready",
            value: configSummary.emailConfigured ? "Yes" : "No",
            status: configSummary.emailConfigured ? "active" : "suspended",
          },
          {
            label: "Resend webhook secret",
            value: configSummary.resendSecretConfigured
              ? "Configured"
              : "Missing",
            status: configSummary.resendSecretConfigured
              ? "active"
              : "suspended",
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">System health</h1>
        <p className="mt-1 text-sm text-slate-400">
          Configuration status only — secrets are never displayed.
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-800">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-900 text-slate-400">
            <tr>
              <th className="px-3 py-2 font-medium">Check</th>
              <th className="px-3 py-2 font-medium">Value</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-t border-slate-800">
                <td className="px-3 py-2">{row.label}</td>
                <td className="px-3 py-2 text-slate-300">{row.value}</td>
                <td className="px-3 py-2">
                  {"status" in row && row.status ? (
                    <PlatformStatusBadge status={row.status} />
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function PlatformHealthPage() {
  return (
    <Suspense fallback={<div className="text-slate-400">Loading health…</div>}>
      <HealthContent />
    </Suspense>
  );
}
