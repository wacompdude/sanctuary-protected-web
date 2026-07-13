"use client";

import { useActionState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { revokeChurchInvitation } from "@/app/(app)/team/invite-actions";
import { Button } from "@/components/ui/button";
import type { InviteActionState } from "@/lib/church/invitations";

const initialState: InviteActionState = {};

export function RevokeInvitationButton({
  invitationId,
  email,
}: {
  invitationId: string;
  email: string;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    revokeChurchInvitation,
    initialState,
  );
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (state.success) {
      router.refresh();
    }
  }, [state.success, router]);

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-7 text-xs"
        disabled={pending || isPending}
        onClick={() => {
          const ok = window.confirm(
            `Revoke the invitation for ${email}? They will no longer be able to accept it.`,
          );
          if (!ok) return;
          const formData = new FormData();
          formData.set("invitation_id", invitationId);
          startTransition(() => {
            formAction(formData);
          });
        }}
      >
        Revoke
      </Button>
      {state.error && (
        <p className="text-xs text-destructive" role="alert">
          {state.error}
        </p>
      )}
    </div>
  );
}
