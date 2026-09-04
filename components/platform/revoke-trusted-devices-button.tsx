"use client";

import { useActionState } from "react";
import {
  revokeMemberTrustedDevicesAction,
  type PlatformTrustedDeviceActionState,
} from "@/app/platform/(console)/churches/[id]/members/actions";
import { PlatformButton } from "@/components/platform/platform-button";

const initialState: PlatformTrustedDeviceActionState = {};

export function RevokeTrustedDevicesButton({
  userId,
  churchId,
}: {
  userId: string;
  churchId: string;
}) {
  const [state, action, pending] = useActionState(
    revokeMemberTrustedDevicesAction,
    initialState,
  );

  return (
    <form action={action} className="space-y-1">
      <input type="hidden" name="user_id" value={userId} />
      <input type="hidden" name="church_id" value={churchId} />
      <PlatformButton type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? "Revoking..." : "Force verification"}
      </PlatformButton>
      {state.error ? (
        <p className="text-xs text-red-400">{state.error}</p>
      ) : null}
      {state.success ? (
        <p className="text-xs text-emerald-400">
          Trusted devices revoked. Next login requires verification.
        </p>
      ) : null}
    </form>
  );
}
