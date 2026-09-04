"use client";

import { useActionState, useState } from "react";
import {
  updatePlatformMfaPolicyAction,
  type MfaPolicyActionState,
} from "@/app/platform/(console)/security/actions";
import { PlatformButton } from "@/components/platform/platform-button";
import { Label } from "@/components/ui/label";
import { modalOverlayClasses, modalPanelClasses } from "@/components/ui/modal";

const initialState: MfaPolicyActionState = {};

export function PlatformMfaPolicyForm({
  enabled,
  environmentLabel,
  isProduction,
  emergencyOverrideActive,
}: {
  enabled: boolean;
  environmentLabel: string;
  isProduction: boolean;
  emergencyOverrideActive: boolean;
}) {
  const [state, action, pending] = useActionState(
    updatePlatformMfaPolicyAction,
    initialState,
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const effectiveEnabled = enabled && !emergencyOverrideActive;

  return (
    <div className="space-y-4">
      {state.error ? (
        <p className="rounded-md border border-red-700/60 bg-red-950/40 px-3 py-2 text-sm text-red-100">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="rounded-md border border-emerald-700/50 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-100">
          Platform MFA policy updated.
        </p>
      ) : null}

      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-slate-500">Platform MFA Policy</dt>
          <dd>
            <span
              className={`rounded-md px-2 py-1 text-xs font-semibold ${
                enabled
                  ? "bg-emerald-950 text-emerald-200"
                  : "bg-red-950 text-red-200"
              }`}
            >
              {enabled ? "ON" : "OFF"}
            </span>
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Environment Override</dt>
          <dd className={emergencyOverrideActive ? "font-semibold text-red-200" : "text-slate-200"}>
            {emergencyOverrideActive ? "DISABLED MFA" : "Inactive"}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-slate-500">Effective Platform MFA</dt>
          <dd className="font-medium text-amber-200">
            {effectiveEnabled ? "ENABLED" : "NOT REQUIRED"}
            {emergencyOverrideActive ? (
              <span className="ml-2 text-xs font-normal text-red-200">
                Reason: Emergency environment override
              </span>
            ) : null}
          </dd>
        </div>
      </dl>

      <p className="text-sm text-slate-400">
        When disabled, users can sign in using their email address and password
        without completing the additional MFA verification step. Existing MFA
        enrollments and trusted devices are preserved.
      </p>

      {emergencyOverrideActive ? (
        <p className="rounded-md border border-red-700/60 bg-red-950/40 px-3 py-2 text-sm text-red-100">
          The Super Admin toggle cannot override the emergency environment
          configuration. Saved Platform and organization policies remain stored
          and become effective when the override is removed.
        </p>
      ) : null}

      {enabled ? (
        <PlatformButton
          type="button"
          variant="destructive"
          disabled={pending}
          onClick={() => setConfirmOpen(true)}
        >
          Turn platform MFA off
        </PlatformButton>
      ) : (
        <form action={action}>
          <input type="hidden" name="mfa_enabled" value="true" />
          <PlatformButton type="submit" disabled={pending}>
            {pending ? "Saving…" : "Turn platform MFA on"}
          </PlatformButton>
        </form>
      )}

      {confirmOpen ? (
        <div
          className={modalOverlayClasses("z-[80]")}
          role="presentation"
          onClick={() => setConfirmOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="disable-platform-mfa-title"
            className={modalPanelClasses("border-red-800 bg-slate-950 text-slate-50")}
            onClick={(event) => event.stopPropagation()}
          >
            <h2
              id="disable-platform-mfa-title"
              className="text-lg font-semibold"
            >
              Disable MFA Platform-Wide?
            </h2>
            <p className="mt-2 text-sm text-slate-300">
              Disabling MFA will allow users across all organizations to sign
              in using only their email address and password. Existing MFA
              enrollments will be preserved and will become active again when
              MFA is re-enabled.
            </p>
            {isProduction ? (
              <p className="mt-3 rounded-md border border-red-700/70 bg-red-950/50 px-3 py-2 text-sm text-red-100">
                You are disabling MFA in the Production environment (
                {environmentLabel}).
              </p>
            ) : (
              <p className="mt-3 text-xs text-slate-500">
                Environment: {environmentLabel}
              </p>
            )}
            <form action={action} className="mt-4 space-y-3">
              <input type="hidden" name="mfa_enabled" value="false" />
              <div className="space-y-1.5">
                <Label htmlFor="platform-mfa-reason">
                  Reason (optional)
                </Label>
                <textarea
                  id="platform-mfa-reason"
                  name="reason"
                  rows={3}
                  placeholder="Testing authentication workflow"
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                />
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <PlatformButton
                  type="button"
                  variant="outline"
                  onClick={() => setConfirmOpen(false)}
                >
                  Cancel
                </PlatformButton>
                <PlatformButton type="submit" variant="destructive" disabled={pending}>
                  {pending ? "Disabling…" : "Disable MFA"}
                </PlatformButton>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
