"use client";

import { useActionState, useState } from "react";
import {
  requireOrganizationMfaImmediatelyAction,
  requirePlatformMfaImmediatelyAction,
  type MfaPolicyActionState,
} from "@/app/platform/(console)/security/actions";
import { PlatformButton } from "@/components/platform/platform-button";
import { Label } from "@/components/ui/label";
import { modalOverlayClasses, modalPanelClasses } from "@/components/ui/modal";

const initialState: MfaPolicyActionState = {};

export function RequireMfaImmediatelyForm({
  scope,
  organizationId,
  emergencyOverrideActive,
}: {
  scope: "platform" | "organization";
  organizationId?: string;
  emergencyOverrideActive?: boolean;
}) {
  const action =
    scope === "platform"
      ? requirePlatformMfaImmediatelyAction
      : requireOrganizationMfaImmediatelyAction;
  const [state, formAction, pending] = useActionState(action, initialState);
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-3">
      {state.error ? (
        <p className="rounded-md border border-red-700/60 bg-red-950/40 px-3 py-2 text-sm text-red-100">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="rounded-md border border-emerald-700/50 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-100">
          {state.message ?? "MFA reauthentication required."}
        </p>
      ) : null}
      <div>
        <h3 className="text-sm font-medium text-slate-100">
          Require MFA Immediately
        </h3>
        <p className="mt-1 text-sm text-slate-400">
          Require currently authenticated users to satisfy the current MFA
          policy again before continuing to protected application
          functionality. Existing MFA enrollment and trusted-device records
          will not be deleted.
        </p>
      </div>
      {emergencyOverrideActive ? (
        <p className="text-xs text-amber-200">
          The emergency environment override is active, so this cutoff is
          stored and becomes effective when the override is removed.
        </p>
      ) : null}
      <PlatformButton type="button" variant="outline" onClick={() => setOpen(true)}>
        Require MFA Immediately
      </PlatformButton>

      {open ? (
        <div
          className={modalOverlayClasses("z-[80]")}
          role="presentation"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="require-mfa-title"
            className={modalPanelClasses("border-amber-800 bg-slate-950 text-slate-50")}
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="require-mfa-title" className="text-lg font-semibold">
              Require MFA for Active Sessions?
            </h2>
            <p className="mt-2 text-sm text-slate-300">
              This will require affected users to complete the current MFA
              verification requirements before continuing to protected
              application functionality. Existing MFA enrollment and
              trusted-device records will not be deleted.
            </p>
            <form action={formAction} className="mt-4 space-y-3">
              {organizationId ? (
                <input type="hidden" name="organization_id" value={organizationId} />
              ) : null}
              <div className="space-y-1.5">
                <Label htmlFor="reauth-reason">Reason (optional)</Label>
                <textarea
                  id="reauth-reason"
                  name="reason"
                  rows={2}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                />
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <PlatformButton type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </PlatformButton>
                <PlatformButton type="submit" variant="destructive" disabled={pending}>
                  {pending ? "Saving…" : "Require MFA"}
                </PlatformButton>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
