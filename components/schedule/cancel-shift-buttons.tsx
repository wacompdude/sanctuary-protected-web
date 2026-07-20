"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  cancelScheduleShiftAction,
  cancelShiftAssignmentAction,
} from "@/app/(app)/schedule/shift-actions";
import { Button } from "@/components/ui/button";

export function CancelScheduleShiftButton({ shiftId }: { shiftId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="destructive"
        disabled={pending}
        onClick={() => {
          if (!window.confirm("Cancel this shift and open assignments?")) return;
          startTransition(async () => {
            const result = await cancelScheduleShiftAction(shiftId);
            if (result.error) {
              setError(result.error);
              return;
            }
            router.refresh();
          });
        }}
      >
        {pending ? "Cancelling…" : "Cancel shift"}
      </Button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}

export function CancelAssignmentButton({
  assignmentId,
  shiftId,
}: {
  assignmentId: string;
  shiftId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() => {
        if (!window.confirm("Cancel this assignment?")) return;
        startTransition(async () => {
          await cancelShiftAssignmentAction(assignmentId, shiftId);
          router.refresh();
        });
      }}
    >
      {pending ? "…" : "Cancel"}
    </Button>
  );
}
