"use client";

import { useActionState } from "react";
import Link from "next/link";
import { invitePlatformAccountAction } from "@/app/platform/actions";
import {
  PLATFORM_ACCOUNT_TYPE_OPTIONS,
  PLATFORM_INVITE_EXPIRATION_OPTIONS,
  type PlatformInviteActionState,
} from "@/lib/platform/invitations";
import type { PlatformRoleKey } from "@/lib/platform/role-keys";
import { PLATFORM_ROLE_DISPLAY_NAMES } from "@/lib/platform/role-keys";

const initialState: PlatformInviteActionState = {};

export function PlatformInviteForm({
  assignableRoles,
}: {
  assignableRoles: PlatformRoleKey[];
}) {
  const [state, action, pending] = useActionState(
    invitePlatformAccountAction,
    initialState,
  );

  if (state.success) {
    return (
      <div className="space-y-4 rounded-lg border border-emerald-800 bg-emerald-950/30 p-5 text-sm">
        <p className="font-medium text-emerald-300">Invitation created</p>
        {state.emailSent ? (
          <p className="text-slate-300">
            Invitation email sent. The invitee must create their own password
            and enroll MFA.
          </p>
        ) : (
          <div className="space-y-2 text-slate-300">
            <p>
              Invitation saved, but email was not sent
              {state.emailError ? `: ${state.emailError}` : "."}
            </p>
            {state.invitationUrl ? (
              <p className="break-all rounded border border-slate-700 bg-slate-950 p-3 font-mono text-xs text-amber-200">
                {state.invitationUrl}
              </p>
            ) : null}
          </div>
        )}
        <div className="flex gap-3">
          <Link
            href="/platform/accounts"
            className="text-amber-300 hover:underline"
          >
            Back to accounts
          </Link>
          <Link
            href="/platform/accounts/new"
            className="text-slate-400 hover:underline"
          >
            Invite another
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-5">
      {state.error ? (
        <p className="rounded border border-rose-800 bg-rose-950/40 px-3 py-2 text-sm text-rose-200">
          {state.error}
        </p>
      ) : null}

      <label className="block text-sm">
        <span className="mb-1 block text-slate-400">Email</span>
        <input
          name="email"
          type="email"
          required
          className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
        />
        {state.fieldErrors?.email ? (
          <span className="mt-1 block text-xs text-rose-300">
            {state.fieldErrors.email}
          </span>
        ) : null}
      </label>

      <label className="block text-sm">
        <span className="mb-1 block text-slate-400">Display name</span>
        <input
          name="display_name"
          className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
        />
      </label>

      <label className="block text-sm">
        <span className="mb-1 block text-slate-400">Account type</span>
        <select
          name="account_type"
          defaultValue="developer"
          className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
        >
          {PLATFORM_ACCOUNT_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="space-y-2 text-sm">
        <legend className="mb-1 text-slate-400">Platform roles</legend>
        {assignableRoles.length === 0 ? (
          <p className="text-rose-300">
            You do not have permission to assign any platform roles.
          </p>
        ) : (
          assignableRoles.map((roleKey) => (
            <label key={roleKey} className="flex items-center gap-2">
              <input
                type="checkbox"
                name="role_keys"
                value={roleKey}
                defaultChecked={roleKey === "developer"}
              />
              <span>{PLATFORM_ROLE_DISPLAY_NAMES[roleKey]}</span>
            </label>
          ))
        )}
        {state.fieldErrors?.role_keys ? (
          <span className="block text-xs text-rose-300">
            {state.fieldErrors.role_keys}
          </span>
        ) : null}
      </fieldset>

      <label className="block text-sm">
        <span className="mb-1 block text-slate-400">Expires</span>
        <select
          name="expires_in_days"
          defaultValue="14"
          className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
        >
          {PLATFORM_INVITE_EXPIRATION_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-sm">
        <span className="mb-1 block text-slate-400">Invitation note</span>
        <textarea
          name="invitation_note"
          rows={3}
          className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
          placeholder="Optional context for the invitee / audit trail"
        />
      </label>

      <input type="hidden" name="require_mfa" value="true" />

      <p className="text-xs text-slate-500">
        No permanent password is set by you. The invitee creates their own
        password and must enroll MFA before console access.
      </p>

      <button
        type="submit"
        disabled={pending || assignableRoles.length === 0}
        className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-amber-400 disabled:opacity-50"
      >
        {pending ? "Sending…" : "Send invitation"}
      </button>
    </form>
  );
}
