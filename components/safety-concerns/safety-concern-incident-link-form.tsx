"use client";

import { useActionState } from "react";
import { linkSafetyConcernIncident } from "@/app/(app)/safety-concerns/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SAFETY_CONCERN_INCIDENT_RELATIONSHIPS } from "@/lib/safety-concerns/constants";
import type { SafetyConcernActionState } from "@/lib/safety-concerns/types";

const selectClassName =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

const textareaClassName =
  "flex min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function SafetyConcernIncidentLinkForm({
  profileId,
  incidents,
}: {
  profileId: string;
  incidents: { id: string; title: string }[];
}) {
  const [state, formAction, pending] = useActionState(
    linkSafetyConcernIncident.bind(null, profileId),
    {} as SafetyConcernActionState,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Link related incident</CardTitle>
        <CardDescription>
          Only same-church incidents you can access may be linked.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {incidents.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No incidents available to link.
          </p>
        ) : (
          <form action={formAction} className="space-y-4">
            {state.error && (
              <p className="text-sm text-destructive">{state.error}</p>
            )}
            {state.success && (
              <p className="text-sm text-green-700 dark:text-green-400">
                Incident linked.
              </p>
            )}
            <div className="space-y-2">
              <Label htmlFor="incident_id">Incident</Label>
              <select
                id="incident_id"
                name="incident_id"
                className={selectClassName}
                required
                defaultValue=""
              >
                <option value="" disabled>
                  Select incident…
                </option>
                {incidents.map((incident) => (
                  <option key={incident.id} value={incident.id}>
                    {incident.title}
                  </option>
                ))}
              </select>
              {state.fieldErrors?.incident_id && (
                <p className="text-sm text-destructive">
                  {state.fieldErrors.incident_id}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="relationship_type">Relationship</Label>
              <select
                id="relationship_type"
                name="relationship_type"
                className={selectClassName}
                defaultValue="person_involved"
              >
                {SAFETY_CONCERN_INCIDENT_RELATIONSHIPS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Link notes</Label>
              <textarea
                id="notes"
                name="notes"
                className={textareaClassName}
                maxLength={1000}
              />
            </div>
            <Button type="submit" disabled={pending}>
              {pending ? "Linking…" : "Link incident"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
