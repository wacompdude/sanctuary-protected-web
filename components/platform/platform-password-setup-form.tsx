"use client";

import { useActionState } from "react";
import {
  changePlatformPasswordAction,
  type PlatformSetupActionState,
} from "@/app/platform/actions";

const initialState: PlatformSetupActionState = {};

export function PlatformPasswordSetupForm() {
  const [state, action, pending] = useActionState(
    changePlatformPasswordAction,
    initialState,
  );

  return (
    <form action={action} className="max-w-md space-y-4">
      {state.error ? (
        <p className="rounded border border-rose-800 bg-rose-950/40 px-3 py-2 text-sm text-rose-200">
          {state.error}
        </p>
      ) : null}

      <label className="block text-sm">
        <span className="mb-1 block text-slate-400">Current password</span>
        <input
          name="current_password"
          type="password"
          required
          autoComplete="current-password"
          className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
        />
        {state.fieldErrors?.current_password ? (
          <span className="mt-1 block text-xs text-rose-300">
            {state.fieldErrors.current_password}
          </span>
        ) : null}
      </label>

      <label className="block text-sm">
        <span className="mb-1 block text-slate-400">New password</span>
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
        <span className="mb-1 block text-slate-400">Confirm new password</span>
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

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-amber-400 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Change password and continue"}
      </button>
    </form>
  );
}
