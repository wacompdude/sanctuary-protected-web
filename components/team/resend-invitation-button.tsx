"use client";

import { useActionState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resendChurchInvitation } from "@/app/(app)/team/invite-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { InviteActionState } from "@/lib/church/invitations";

const initialState: InviteActionState = {};

export function ResendInvitationButton({
  invitationId,
  email,
}: {
  invitationId: string;
  email: string;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    resendChurchInvitation,
    initialState,
  );
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (state.success) {
      router.refresh();
    }
  }, [state.success, router]);

  return (
    <div className="flex max-w-sm flex-col items-end gap-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-7 text-xs"
        disabled={pending || isPending}
        onClick={() => {
          const ok = window.confirm(
            `Resend the invitation for ${email}? The previous link will stop working and a new one will be generated.`,
          );
          if (!ok) return;
          const formData = new FormData();
          formData.set("invitation_id", invitationId);
          startTransition(() => {
            formAction(formData);
          });
        }}
      >
        {pending || isPending ? "Resending…" : "Resend"}
      </Button>
      {state.error && (
        <p className="text-xs text-destructive" role="alert">
          {state.error}
        </p>
      )}
      {state.success && state.invitationUrl && (
        <div className="w-full space-y-1 rounded-md border border-green-500/30 bg-green-500/10 px-2 py-2 text-xs">
          <p className="font-medium text-green-800 dark:text-green-300">
            New link ready — copy and share it:
          </p>
          <Input
            readOnly
            value={state.invitationUrl}
            className="h-8 font-mono text-xs"
            onFocus={(event) => event.currentTarget.select()}
          />
        </div>
      )}
    </div>
  );
}
