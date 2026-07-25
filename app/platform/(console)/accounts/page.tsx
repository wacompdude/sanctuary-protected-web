import Link from "next/link";
import { Suspense } from "react";
import { revokePlatformInvitationAction } from "@/app/platform/actions";
import { PlatformPagination } from "@/components/platform/platform-pagination";
import { PlatformStatusBadge } from "@/components/platform/platform-status-badge";
import {
  hasPlatformPermission,
  requirePlatformPermission,
} from "@/lib/platform/auth";
import { listPlatformAccounts } from "@/lib/platform/console-queries";
import { listPendingPlatformInvitations } from "@/lib/platform/invitation-service";
import { labelForPlatformRoleKey } from "@/lib/platform/invitations";
import { PLATFORM_ROLE_DISPLAY_NAMES } from "@/lib/platform/role-keys";
import type { PlatformRoleKey } from "@/lib/platform/role-keys";

async function AccountsContent({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  await requirePlatformPermission("platform.accounts.read");
  const params = await searchParams;
  const canCreate = await hasPlatformPermission("platform.accounts.create");
  const canUpdate = await hasPlatformPermission("platform.accounts.update");
  const result = await listPlatformAccounts({
    q: params.q,
    status: params.status,
    page: Number(params.page || "1"),
  });
  const pendingInvites = canCreate
    ? await listPendingPlatformInvitations().catch(() => [])
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Platform accounts
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Internal operators only. Church roles never appear here.
          </p>
        </div>
        {canCreate ? (
          <Link
            href="/platform/accounts/new"
            className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-amber-400"
          >
            Invite account
          </Link>
        ) : null}
      </div>

      {pendingInvites.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-lg font-medium">Pending invitations</h2>
          <div className="overflow-x-auto rounded-lg border border-slate-800">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-900 text-slate-400">
                <tr>
                  <th className="px-3 py-2 font-medium">Email</th>
                  <th className="px-3 py-2 font-medium">Roles</th>
                  <th className="px-3 py-2 font-medium">Expires</th>
                  <th className="px-3 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pendingInvites.map((invite) => (
                  <tr key={invite.id} className="border-t border-slate-800">
                    <td className="px-3 py-2">
                      {invite.display_name || invite.email}
                      <p className="text-xs text-slate-500">{invite.email}</p>
                    </td>
                    <td className="px-3 py-2 text-slate-300">
                      {invite.role_keys
                        .map((key) => labelForPlatformRoleKey(key))
                        .join(", ")}
                    </td>
                    <td className="px-3 py-2 text-slate-400">
                      {new Date(invite.expires_at).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-2">
                      {canUpdate ? (
                        <form action={revokePlatformInvitationAction}>
                          <input
                            type="hidden"
                            name="invitation_id"
                            value={invite.id}
                          />
                          <button
                            type="submit"
                            className="text-rose-300 hover:underline"
                          >
                            Revoke
                          </button>
                        </form>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <form
        method="get"
        className="grid gap-3 rounded-lg border border-slate-800 bg-slate-900/40 p-4 md:grid-cols-3"
      >
        <label className="text-sm md:col-span-2">
          <span className="mb-1 block text-slate-400">Search</span>
          <input
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Email or name"
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-400">Status</span>
          <select
            name="status"
            defaultValue={params.status ?? "all"}
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
          >
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="invited">Invited</option>
            <option value="disabled">Disabled</option>
            <option value="locked">Locked</option>
            <option value="archived">Archived</option>
          </select>
        </label>
        <div>
          <button
            type="submit"
            className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-amber-400"
          >
            Apply filters
          </button>
        </div>
      </form>

      <div className="overflow-x-auto rounded-lg border border-slate-800">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-900 text-slate-400">
            <tr>
              <th className="px-3 py-2 font-medium">Account</th>
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 font-medium">Roles</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">MFA</th>
              <th className="px-3 py-2 font-medium">Last login</th>
            </tr>
          </thead>
          <tbody>
            {result.items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-slate-500">
                  No platform accounts found.
                </td>
              </tr>
            ) : (
              result.items.map((account) => (
                <tr key={account.id} className="border-t border-slate-800">
                  <td className="px-3 py-2">
                    <Link
                      href={`/platform/accounts/${account.id}`}
                      className="font-medium text-amber-300 hover:underline"
                    >
                      {account.display_name || account.email_snapshot}
                    </Link>
                    <p className="text-xs text-slate-500">
                      {account.email_snapshot}
                    </p>
                  </td>
                  <td className="px-3 py-2 capitalize">{account.account_type}</td>
                  <td className="px-3 py-2 text-slate-300">
                    {account.roleKeys.length
                      ? account.roleKeys
                          .map(
                            (key) =>
                              PLATFORM_ROLE_DISPLAY_NAMES[
                                key as PlatformRoleKey
                              ] ?? key,
                          )
                          .join(", ")
                      : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <PlatformStatusBadge status={account.status} />
                  </td>
                  <td className="px-3 py-2">
                    {account.mfa_verified_at
                      ? "Verified"
                      : account.mfa_required
                        ? "Required"
                        : "Optional"}
                  </td>
                  <td className="px-3 py-2 text-slate-400">
                    {account.last_platform_login_at
                      ? new Date(
                          account.last_platform_login_at,
                        ).toLocaleString()
                      : "—"}
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
        basePath="/platform/accounts"
        query={{ q: params.q, status: params.status }}
      />
    </div>
  );
}

export default function PlatformAccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  return (
    <Suspense
      fallback={<div className="text-slate-400">Loading accounts…</div>}
    >
      <AccountsContent searchParams={searchParams} />
    </Suspense>
  );
}
