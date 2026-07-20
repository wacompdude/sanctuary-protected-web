"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cancelScheduleEventAction } from "@/app/(app)/schedule/actions";
import { Button } from "@/components/ui/button";

export function CancelScheduleEventButton({ eventId }: { eventId: string }) {
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
          if (
            !window.confirm(
              "Cancel this event? Related open shifts will also be cancelled.",
            )
          ) {
            return;
          }
          startTransition(async () => {
            const result = await cancelScheduleEventAction(eventId);
            if (result.error) {
              setError(result.error);
              return;
            }
            router.refresh();
          });
        }}
      >
        {pending ? "Cancelling…" : "Cancel event"}
      </Button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
