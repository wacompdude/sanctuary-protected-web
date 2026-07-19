"use client";

import { useActionState, useEffect, useRef } from "react";
import {
  acknowledgePolicy,
  markPolicyViewed,
} from "@/app/(app)/policies/acknowledgment-actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatChurchDateTime } from "@/lib/datetime/format";
import { labelForPolicyAcknowledgmentStatus } from "@/lib/policies/constants";
import type { PolicyAcknowledgment } from "@/lib/policies/types";
import type { ActionState } from "@/lib/church/types";

const initialState: ActionState = {};

const textareaClassName =
  "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function PolicyAcknowledgeForm({
  policyId,
  acknowledgment,
  timeZone,
}: {
  policyId: string;
  acknowledgment: PolicyAcknowledgment | null;
  timeZone?: string | null;
}) {
  const bound = acknowledgePolicy.bind(null, policyId);
  const [state, formAction, pending] = useActionState(bound, initialState);
  const viewedRef = useRef(false);

  useEffect(() => {
    if (viewedRef.current) return;
    viewedRef.current = true;
    void markPolicyViewed(policyId);
  }, [policyId]);

  if (!acknowledgment) {
    return null;
  }

  if (
    acknowledgment.acknowledgment_status === "acknowledged" ||
    acknowledgment.acknowledgment_status === "waived"
  ) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Your acknowledgment</CardTitle>
          <CardDescription>
            {labelForPolicyAcknowledgmentStatus(
              acknowledgment.acknowledgment_status,
            )}
            {acknowledgment.acknowledged_at
              ? ` · ${formatChurchDateTime(acknowledgment.acknowledged_at, { timeZone })}`
              : ""}
            {acknowledgment.waived_at
              ? ` · ${formatChurchDateTime(acknowledgment.waived_at, { timeZone })}`
              : ""}
          </CardDescription>
        </CardHeader>
        {acknowledgment.acknowledgment_text || acknowledgment.waiver_reason ? (
          <CardContent className="text-sm text-muted-foreground">
            {acknowledgment.acknowledgment_text || acknowledgment.waiver_reason}
          </CardContent>
        ) : null}
      </Card>
    );
  }

  return (
    <Card className="border-amber-500/40">
      <CardHeader>
        <CardTitle className="text-base">Acknowledgment required</CardTitle>
        <CardDescription>
          Status:{" "}
          {labelForPolicyAcknowledgmentStatus(
            acknowledgment.acknowledgment_status,
          )}
          {acknowledgment.due_at
            ? ` · Due ${formatChurchDateTime(acknowledgment.due_at, { timeZone })}`
            : ""}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-3">
          {state.error ? (
            <p className="text-sm text-destructive">{state.error}</p>
          ) : null}
          {state.success ? (
            <p className="text-sm text-green-700 dark:text-green-400">
              Acknowledgment recorded. Thank you.
            </p>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="acknowledgment_text">Confirmation (optional)</Label>
            <textarea
              id="acknowledgment_text"
              name="acknowledgment_text"
              className={textareaClassName}
              placeholder="I have read and understand this policy."
              defaultValue="I have read and understand this policy."
            />
            {state.fieldErrors?.acknowledgment_text ? (
              <p className="text-sm text-destructive">
                {state.fieldErrors.acknowledgment_text}
              </p>
            ) : null}
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "I acknowledge this policy"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
