import { Suspense } from "react";
import { PlatformStatusBadge } from "@/components/platform/platform-status-badge";
import { getPlatformProviderConfigStatus } from "@/lib/platform/system-status";

async function ConfigContent() {
  const status = await getPlatformProviderConfigStatus();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Provider configuration
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Safe configuration status only — API keys and secrets are never shown.
        </p>
      </div>

      <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-5 text-sm">
        <h2 className="font-medium text-slate-200">Billing</h2>
        <dl className="mt-3 grid gap-2 sm:grid-cols-2">
          <div>
            <dt className="text-slate-500">Requested provider</dt>
            <dd>{status.billing.requested}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Active adapter</dt>
            <dd>{status.billing.providerId}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Configured</dt>
            <dd>
              <PlatformStatusBadge
                status={status.billing.configured ? "active" : "suspended"}
              />
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-slate-500">Message</dt>
            <dd className="text-slate-300">{status.billing.message}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-5 text-sm">
        <h2 className="font-medium text-slate-200">Email</h2>
        <dl className="mt-3 grid gap-2 sm:grid-cols-2">
          <div>
            <dt className="text-slate-500">Provider</dt>
            <dd>{status.email.provider}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Domain</dt>
            <dd>{status.email.domain || "—"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Configured</dt>
            <dd>
              <PlatformStatusBadge
                status={status.email.configured ? "active" : "suspended"}
              />
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Senders</dt>
            <dd>
              {status.email.sendersConfigured} ok /{" "}
              {status.email.sendersErrored} error
            </dd>
          </div>
        </dl>
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-5 text-sm">
        <h2 className="font-medium text-slate-200">Webhooks & cron</h2>
        <dl className="mt-3 space-y-2">
          <div>
            <dt className="text-slate-500">Billing endpoint</dt>
            <dd className="font-mono text-xs text-slate-300">
              {status.webhooks.billingEndpoint}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Resend endpoint</dt>
            <dd className="font-mono text-xs text-slate-300">
              {status.webhooks.resendEndpoint}
            </dd>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-500">Resend secret configured:</span>
            <PlatformStatusBadge
              status={
                status.webhooks.resendSecretConfigured ? "active" : "suspended"
              }
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-500">Service role:</span>
            <PlatformStatusBadge
              status={
                status.serviceRoleConfigured ? "active" : "suspended"
              }
            />
          </div>
        </dl>
        <ul className="mt-4 space-y-2 text-sm text-slate-300">
          {status.cronRoutes.map((route) => (
            <li key={route.path}>
              <span className="font-mono text-xs text-amber-200/80">
                {route.path}
              </span>
              <span className="ml-2 text-slate-500">{route.purpose}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export default function PlatformConfigPage() {
  return (
    <Suspense fallback={<div className="text-slate-400">Loading config…</div>}>
      <ConfigContent />
    </Suspense>
  );
}
