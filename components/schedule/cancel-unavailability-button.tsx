"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cancelUnavailabilityAction } from "@/app/(app)/schedule/availability-actions";
import { Button } from "@/components/ui/button";

export function CancelUnavailabilityButton({
  unavailabilityId,
}: {
  unavailabilityId: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => {
          if (!window.confirm("Cancel this unavailable period?")) return;
          startTransition(async () => {
            const result = await cancelUnavailabilityAction(unavailabilityId);
            if (result.error) {
              setError(result.error);
              return;
            }
            router.refresh();
          });
        }}
      >
        {pending ? "…" : "Cancel"}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
