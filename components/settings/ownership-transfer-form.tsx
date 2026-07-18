"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { transferOwnershipToCoOwnerAction } from "@/app/(app)/settings/ownership/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionState } from "@/lib/church/types";
import { labelForMembershipRole } from "@/lib/church/invitations";

export type OwnershipTransferCandidate = {
  membershipId: string;
  name: string;
  email: string | null;
  role: string;
};

const initialState: ActionState = {};

export function OwnershipTransferForm({
  churchName,
  isPrimaryOwner,
  candidates,
}: {
  churchName: string;
  isPrimaryOwner: boolean;
  candidates: OwnershipTransferCandidate[];
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    transferOwnershipToCoOwnerAction,
    initialState,
  );

  useEffect(() => {
    if (state.success) {
      router.refresh();
    }
  }, [state.success, router]);

  if (!isPrimaryOwner) {
    return (
      <p className="text-sm text-muted-foreground">
        Only the primary owner can transfer ownership. Co-owners already have
        the same administrative privileges for day-to-day church management.
      </p>
    );
  }

  if (candidates.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Assign at least one active co-owner on the Team page before transferring
        ownership.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="rounded-md border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-800 dark:text-green-300">
          Ownership transferred. You are now a co-owner.
        </p>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="membership_id">Transfer to co-owner</Label>
        <select
          id="membership_id"
          name="membership_id"
          required
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          defaultValue=""
        >
          <option value="" disabled>
            Select a co-owner…
          </option>
          {candidates.map((candidate) => (
            <option key={candidate.membershipId} value={candidate.membershipId}>
              {candidate.name}
              {candidate.email ? ` (${candidate.email})` : ""} —{" "}
              {labelForMembershipRole(candidate.role)}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirm_name">
          Type <span className="font-semibold">{churchName}</span> to confirm
        </Label>
        <Input
          id="confirm_name"
          name="confirm_name"
          autoComplete="off"
          required
          aria-invalid={!!state.fieldErrors?.confirm_name}
        />
        {state.fieldErrors?.confirm_name ? (
          <p className="text-sm text-destructive">
            {state.fieldErrors.confirm_name}
          </p>
        ) : null}
      </div>

      <input type="hidden" name="confirmed" value="1" />

      <Button type="submit" variant="destructive" disabled={pending}>
        {pending ? "Transferring…" : "Transfer ownership"}
      </Button>
    </form>
  );
}
