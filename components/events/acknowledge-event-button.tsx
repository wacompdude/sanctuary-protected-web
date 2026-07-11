"use client";

import { useTransition } from "react";
import { acknowledgeEvent } from "@/app/(app)/events/actions";
import { Button } from "@/components/ui/button";

export function AcknowledgeEventButton({ eventId }: { eventId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          await acknowledgeEvent(eventId);
        });
      }}
    >
      {pending ? "Saving…" : "Acknowledge"}
    </Button>
  );
}
