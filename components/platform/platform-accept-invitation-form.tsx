"use client";

import { useActionState } from "react";
import Link from "next/link";
import { acceptPlatformInvitationAction } from "@/app/platform/actions";
import type { PlatformInviteActionState } from "@/lib/platform/invitations";
import { labelForPlatformRoleKey } from "@/lib/platform/invitations";

const initialState: PlatformInviteActionState = {};

export function PlatformAcceptInvitationForm({
  token,
  email,
  displayName,
  roleKeys,
  signedIn,
  signedInEmail,
}: {
  token: string;
  email: string;
  displayName: string | null;
  roleKeys: string[];
  signedIn: boolean;
  signedInEmail: string | null;
}) {
  const [state, action, pending] = useActionState(
    acceptPlatformInvitationAction,
    initialState,
  );

  const emailMismatch =
    signedIn &&
    signedInEmail &&
    signedInEmail.trim().toLowerCase() !== email.trim().toLowerCase();

  return (
    <div className="mx-auto max-w-lg space-y-6 rounded-lg border border-slate-800 bg-slate-900/50 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Accept platform invitation
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          You were invited as{" "}
          <strong className="text-slate-200">{displayName || email}</strong> (
          {email}).
        </p>
        <p className="mt-1 text-sm text-slate-400">
          Roles:{" "}
          {roleKeys.map((key) => labelForPlatformRoleKey(key)).join(", ") ||
            "developer"}
        </p>
      </div>

      {state.error ? (
        <p className="rounded border border-rose-800 bg-rose-950/40 px-3 py-2 text-sm text-rose-200">
          {state.error}
        </p>
      ) : null}

      {emailMismatch ? (
        <div className="space-y-3 text-sm text-amber-200">
          <p>
            You are signed in as {signedInEmail}, but this invitation is for{" "}
            {email}. Sign out and use the invited email.
          </p>
          <Link href="/login" className="text-amber-300 hover:underline">
            Go to login
          </Link>
        </div>
      ) : (
        <form action={action} className="space-y-4">
          <input type="hidden" name="token" value={token} />

          {signedIn ? (
            <p className="text-sm text-slate-300">
              Continue as {signedInEmail} to attach platform access to this
              account. No password is required.
            </p>
          ) : (
            <>
              <label className="block text-sm">
                <span className="mb-1 block text-slate-400">
                  Create your password
                </span>
                <input
                  name="password"
                  type="password"
                  required
                  autoComplete="new-password"
                  className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
                />
                {state.fieldErrors?.password ? (
                  <span className="mt-1 block text-xs text-rose-300">
                    {state.fieldErrors.password}
                  </span>
                ) : null}
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-slate-400">
                  Confirm password
                </span>
                <input
                  name="confirm_password"
                  type="password"
                  required
                  autoComplete="new-password"
                  className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
                />
                {state.fieldErrors?.confirm_password ? (
                  <span className="mt-1 block text-xs text-rose-300">
                    {state.fieldErrors.confirm_password}
                  </span>
                ) : null}
              </label>
              <p className="text-xs text-slate-500">
                Already have an account with this email?{" "}
                <Link
                  href={`/login?next=${encodeURIComponent(`/platform/invitations/accept?token=${token}`)}`}
                  className="text-amber-300 hover:underline"
                >
                  Sign in first
                </Link>
                , then open this link again.
              </p>
            </>
          )}

          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-amber-400 disabled:opacity-50"
          >
            {pending
              ? "Working…"
              : signedIn
                ? "Accept invitation"
                : "Create account and continue"}
          </button>
        </form>
      )}
    </div>
  );
}
