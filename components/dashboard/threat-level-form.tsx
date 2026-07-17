"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { updateChurchThreatLevel } from "@/app/(app)/dashboard/threat-level/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  THREAT_LEVEL_NOTES_MAX_LENGTH,
  THREAT_LEVEL_OPTIONS,
  type ThreatLevel,
} from "@/lib/church/threat-levels";
import { selectClassName, textareaClassName } from "@/components/incidents/incident-badges";
import type { ActionState } from "@/lib/church/types";

const initialState: ActionState = {};

export function ThreatLevelForm({
  defaultWeekStart,
  defaultThreatLevel = "green",
  defaultNotes = "",
}: {
  defaultWeekStart: string;
  defaultThreatLevel?: ThreatLevel;
  defaultNotes?: string | null;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    updateChurchThreatLevel,
    initialState,
  );

  useEffect(() => {
    if (state.success) {
      router.refresh();
    }
  }, [router, state.success]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Change weekly threat level</CardTitle>
        <CardDescription>
          Save a new weekly threat level entry. Each change is recorded with the
          user, timestamp, and optional notes for historical review.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4" noValidate>
          {state.error && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {state.error}
            </p>
          )}
          {state.success && (
            <p className="rounded-md border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-400">
              Threat level updated successfully.
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="threat_level">Threat level</Label>
              <select
                id="threat_level"
                name="threat_level"
                defaultValue={defaultThreatLevel}
                className={selectClassName}
                aria-invalid={!!state.fieldErrors?.threat_level}
              >
                {THREAT_LEVEL_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label} ({option.rankLabel})
                  </option>
                ))}
              </select>
              {state.fieldErrors?.threat_level && (
                <p className="text-sm text-destructive">
                  {state.fieldErrors.threat_level}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="week_start">Week of</Label>
              <Input
                id="week_start"
                name="week_start"
                type="date"
                defaultValue={defaultWeekStart}
                aria-invalid={!!state.fieldErrors?.week_start}
              />
              {state.fieldErrors?.week_start && (
                <p className="text-sm text-destructive">
                  {state.fieldErrors.week_start}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Threat level notes</Label>
            <textarea
              id="notes"
              name="notes"
              rows={4}
              defaultValue={defaultNotes ?? ""}
              maxLength={THREAT_LEVEL_NOTES_MAX_LENGTH}
              placeholder="Explain why this weekly threat level was selected…"
              className={textareaClassName}
              aria-invalid={!!state.fieldErrors?.notes}
            />
            {state.fieldErrors?.notes && (
              <p className="text-sm text-destructive">{state.fieldErrors.notes}</p>
            )}
          </div>

          <Button
            type="submit"
            disabled={pending}
            className="h-11 w-full sm:w-auto"
          >
            {pending ? "Saving..." : "Save threat level"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
