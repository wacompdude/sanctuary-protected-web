"use client";

import { useActionState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resendIncidentNotificationAction } from "@/app/(app)/incidents/actions";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/lib/incidents/types";
import { BellRing } from "lucide-react";

const initialState: ActionState = {};

export function ResendIncidentNotificationButton({
  incidentId,
  severity,
}: {
  incidentId: string;
  severity: string;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    resendIncidentNotificationAction,
    initialState,
  );
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (state.success) {
      router.refresh();
    }
  }, [state.success, router]);

  if (severity !== "critical" && severity !== "high") {
    return null;
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="outline"
        className="h-11"
        disabled={pending || isPending}
        onClick={() => {
          const ok = window.confirm(
            "Resend the email and in-app alert for this incident to all configured recipients?",
          );
          if (!ok) return;
          const formData = new FormData();
          formData.set("incident_id", incidentId);
          startTransition(() => {
            formAction(formData);
          });
        }}
      >
        <BellRing className="h-4 w-4" />
        {pending || isPending ? "Sending alert…" : "Resend alert"}
      </Button>
      {state.error ? (
        <p className="max-w-xs text-right text-xs text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="max-w-xs text-right text-xs text-green-700 dark:text-green-400">
          Alert resent. Check notification history for delivery status.
        </p>
      ) : null}
    </div>
  );
}
