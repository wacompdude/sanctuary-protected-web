"use client";

import { useActionState, useEffect, useRef } from "react";
import { createTestEvent } from "@/app/(app)/events/actions";
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
import { EVENT_SEVERITIES, EVENT_TYPES } from "@/lib/events/types";
import type { ActionState } from "@/lib/church/types";
import { selectClassName } from "@/components/incidents/incident-badges";
import {
  CampusScopeField,
  type CampusScopeOption,
} from "@/components/campuses/campus-scope-field";

const initialState: ActionState = {};

export function NewEventForm({
  campuses = [],
  defaultCampusId = "",
}: {
  campuses?: CampusScopeOption[];
  defaultCampusId?: string;
}) {
  const [state, formAction, pending] = useActionState(
    createTestEvent,
    initialState,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
    }
  }, [state.success]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create Event</CardTitle>
        <CardDescription>
          Add a device event for testing or manual reporting.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form ref={formRef} action={formAction} className="space-y-4">
          {state.error && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {state.error}
            </p>
          )}
          {state.success && (
            <p className="rounded-md border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-400">
              Event created.
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="device">Device</Label>
              <Input id="device" name="device" placeholder="Camera 12" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="location">Location</Label>
              <Input
                id="location"
                name="location"
                placeholder="North Gate"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="event_type">Event type</Label>
              <select
                id="event_type"
                name="event_type"
                className={selectClassName}
                defaultValue="motion"
              >
                {EVENT_TYPES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="severity">Severity</Label>
              <select
                id="severity"
                name="severity"
                className={selectClassName}
                defaultValue="medium"
              >
                {EVENT_SEVERITIES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="event_timestamp">Event timestamp</Label>
              <Input
                id="event_timestamp"
                name="event_timestamp"
                type="datetime-local"
                required
              />
            </div>
          </div>

          <CampusScopeField
            campuses={campuses}
            defaultValue={defaultCampusId}
          />

          <Button type="submit" disabled={pending}>
            {pending ? "Creating…" : "Create Event"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
