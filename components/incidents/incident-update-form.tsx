"use client";

import { useActionState, useEffect } from "react";
import { addIncidentUpdate } from "@/app/(app)/incidents/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { INCIDENT_STATUSES } from "@/lib/incidents/constants";
import type { ActionState, IncidentStatus } from "@/lib/incidents/types";
import { selectClassName, textareaClassName } from "./incident-badges";

const initialState: ActionState = {};

export function IncidentUpdateForm({
  incidentId,
  currentStatus,
}: {
  incidentId: string;
  currentStatus: IncidentStatus;
}) {
  const boundAction = addIncidentUpdate.bind(null, incidentId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);

  useEffect(() => {
    if (state.success) {
      const form = document.getElementById(
        `incident-update-form-${incidentId}`,
      ) as HTMLFormElement | null;
      form?.reset();
    }
  }, [state.success, incidentId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add Update</CardTitle>
        <CardDescription>
          Post a timeline comment or change the incident status.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          id={`incident-update-form-${incidentId}`}
          action={formAction}
          className="space-y-4"
        >
          {state.error && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {state.error}
            </p>
          )}

          {state.success && (
            <p className="rounded-md border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-400">
              Update posted successfully.
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="content">Comment</Label>
            <textarea
              id="content"
              name="content"
              rows={3}
              placeholder="Add notes for the timeline…"
              className={textareaClassName}
              aria-invalid={!!state.fieldErrors?.content}
            />
            {state.fieldErrors?.content && (
              <p className="text-sm text-destructive">{state.fieldErrors.content}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="status">Change status (optional)</Label>
            <select
              id="status"
              name="status"
              defaultValue=""
              className={selectClassName}
              aria-invalid={!!state.fieldErrors?.status}
            >
              <option value="">Keep current status ({currentStatus})</option>
              {INCIDENT_STATUSES.filter((option) => option.value !== currentStatus).map(
                (option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ),
              )}
            </select>
            {state.fieldErrors?.status && (
              <p className="text-sm text-destructive">{state.fieldErrors.status}</p>
            )}
          </div>

          <Button type="submit" disabled={pending}>
            {pending ? "Posting…" : "Post Update"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
