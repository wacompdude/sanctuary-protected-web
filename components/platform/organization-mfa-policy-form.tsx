"use client";

import { useActionState } from "react";
import {
  updateOrganizationMfaPolicyAction,
  type MfaPolicyActionState,
} from "@/app/platform/(console)/security/actions";
import { PlatformButton } from "@/components/platform/platform-button";

const initialState: MfaPolicyActionState = {};

export function OrganizationMfaPolicyForm({
  organizationId,
  enabled,
  compact = false,
}: {
  organizationId: string;
  enabled: boolean;
  compact?: boolean;
}) {
  const [state, action, pending] = useActionState(
    updateOrganizationMfaPolicyAction,
    initialState,
  );

  return (
    <form action={action} className={compact ? "" : "space-y-3"}>
      <input type="hidden" name="organization_id" value={organizationId} />
      <input type="hidden" name="mfa_enabled" value={enabled ? "false" : "true"} />
      {state.error ? (
        <p className="mb-2 text-xs text-red-300">{state.error}</p>
      ) : null}
      <PlatformButton
        type="submit"
        size={compact ? "sm" : "default"}
        variant={enabled ? "destructive" : "outline"}
        disabled={pending}
      >
        {pending ? "Saving…" : enabled ? "Turn off" : "Turn on"}
      </PlatformButton>
    </form>
  );
}
