"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createIncident } from "@/app/(app)/incidents/actions";
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
  INCIDENT_SEVERITIES,
  INCIDENT_TYPES,
} from "@/lib/incidents/constants";
import { formatDateTimeLocalValue } from "@/lib/incidents/format";
import type { ActionState } from "@/lib/incidents/types";
import { IncidentPhotoPicker } from "@/components/incidents/incident-photo-picker";
import { selectClassName, textareaClassName } from "./incident-badges";

const initialState: ActionState = {};

export function NewIncidentForm({
  requireLocation = true,
  requireSeverity = true,
}: {
  requireLocation?: boolean;
  requireSeverity?: boolean;
}) {
  const router = useRouter();
  const [occurredAt, setOccurredAt] = useState("");
  const [state, formAction, pending] = useActionState(
    createIncident,
    initialState,
  );

  useEffect(() => {
    setOccurredAt(formatDateTimeLocalValue(new Date()));
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Incident Details</CardTitle>
        <CardDescription>
          Fill in the details below to report a new incident.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-6">
          {state.error && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {state.error}
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              name="title"
              placeholder="Brief description of the incident"
              aria-invalid={!!state.fieldErrors?.title}
            />
            {state.fieldErrors?.title && (
              <p className="text-sm text-destructive">{state.fieldErrors.title}</p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="type">Type</Label>
              <select
                id="type"
                name="type"
                defaultValue=""
                className={selectClassName}
                aria-invalid={!!state.fieldErrors?.type}
              >
                <option value="" disabled>
                  Select type
                </option>
                {INCIDENT_TYPES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              {state.fieldErrors?.type && (
                <p className="text-sm text-destructive">{state.fieldErrors.type}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="severity">
                Severity{requireSeverity ? "" : " (optional)"}
              </Label>
              <select
                id="severity"
                name="severity"
                defaultValue=""
                className={selectClassName}
                aria-invalid={!!state.fieldErrors?.severity}
                required={requireSeverity}
              >
                <option value="" disabled={requireSeverity}>
                  Select severity
                </option>
                {INCIDENT_SEVERITIES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              {state.fieldErrors?.severity && (
                <p className="text-sm text-destructive">
                  {state.fieldErrors.severity}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="location">
              Location{requireLocation ? "" : " (optional)"}
            </Label>
            <Input
              id="location"
              name="location"
              placeholder="e.g. North Gate, Building A"
              aria-invalid={!!state.fieldErrors?.location}
              required={requireLocation}
            />
            {state.fieldErrors?.location && (
              <p className="text-sm text-destructive">
                {state.fieldErrors.location}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="occurred_at">Occurred date & time</Label>
            <Input
              id="occurred_at"
              name="occurred_at"
              type="datetime-local"
              value={occurredAt}
              onChange={(event) => setOccurredAt(event.target.value)}
              aria-invalid={!!state.fieldErrors?.occurred_at}
            />
            {state.fieldErrors?.occurred_at && (
              <p className="text-sm text-destructive">
                {state.fieldErrors.occurred_at}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <textarea
              id="description"
              name="description"
              rows={4}
              placeholder="Provide additional details about what happened…"
              className={textareaClassName}
              aria-invalid={!!state.fieldErrors?.description}
            />
            {state.fieldErrors?.description && (
              <p className="text-sm text-destructive">
                {state.fieldErrors.description}
              </p>
            )}
          </div>

          <IncidentPhotoPicker error={state.fieldErrors?.photos} />

          <div className="flex gap-3">
            <Button type="submit" disabled={pending}>
              {pending ? "Submitting…" : "Submit Incident"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push("/incidents")}
            >
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
