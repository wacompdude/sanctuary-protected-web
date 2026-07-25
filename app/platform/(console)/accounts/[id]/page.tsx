import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PlatformStatusBadge } from "@/components/platform/platform-status-badge";
import { getPlatformAccountDetail } from "@/lib/platform/console-queries";
import { PLATFORM_ROLE_DISPLAY_NAMES } from "@/lib/platform/role-keys";
import type { PlatformRoleKey } from "@/lib/platform/role-keys";

async function AccountDetailContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getPlatformAccountDetail(id);
  if (!detail) notFound();
  const { account, permissions } = detail;

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/platform/accounts"
          className="text-sm text-slate-400 hover:text-amber-300"
        >
          ← Platform accounts
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            {account.display_name || account.email_snapshot}
          </h1>
          <PlatformStatusBadge status={account.status} />
        </div>
        <p className="mt-1 text-sm text-slate-400">{account.email_snapshot}</p>
      </div>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4 text-sm">
          <h2 className="font-medium text-slate-200">Overview</h2>
          <dl className="mt-3 space-y-2">
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Account type</dt>
              <dd className="capitalize">{account.account_type}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">MFA</dt>
              <dd>
                {account.mfa_verified_at
                  ? `Verified ${new Date(account.mfa_verified_at).toLocaleString()}`
                  : account.mfa_required
                    ? "Required / not verified"
                    : "Optional"}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Last platform login</dt>
              <dd>
                {account.last_platform_login_at
                  ? new Date(account.last_platform_login_at).toLocaleString()
                  : "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Created</dt>
              <dd>
                {account.created_at
                  ? new Date(account.created_at).toLocaleString()
                  : "—"}
              </dd>
            </div>
          </dl>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4 text-sm">
          <h2 className="font-medium text-slate-200">Roles</h2>
          <ul className="mt-3 space-y-1">
            {account.roleKeys.length === 0 ? (
              <li className="text-slate-500">No active roles</li>
            ) : (
              account.roleKeys.map((key) => (
                <li key={key}>
                  {PLATFORM_ROLE_DISPLAY_NAMES[key as PlatformRoleKey] ?? key}
                </li>
              ))
            )}
          </ul>
        </div>
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
        <h2 className="text-sm font-medium text-slate-200">
          Effective permissions ({permissions.length})
        </h2>
        <ul className="mt-3 grid gap-1 text-xs text-slate-400 sm:grid-cols-2 lg:grid-cols-3">
          {permissions.map((permission) => (
            <li key={permission} className="font-mono">
              {permission}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export default function PlatformAccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense
      fallback={<div className="text-slate-400">Loading account…</div>}
    >
      <AccountDetailContent params={params} />
    </Suspense>
  );
}
