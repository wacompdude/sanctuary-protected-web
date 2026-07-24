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
import type { MedicalSupply } from "@/lib/medical-supplies/types";
import { IncidentPhotoPicker } from "@/components/incidents/incident-photo-picker";
import { IncidentTeamMembersFields } from "@/components/incidents/incident-team-members-fields";
import { MedicalSuppliesUsedFields } from "@/components/incidents/medical-supplies-used-fields";
import type { TeamMemberRow } from "@/lib/church/team";
import { selectClassName, textareaClassName } from "./incident-badges";
import {
  CampusScopeField,
  type CampusScopeOption,
} from "@/components/campuses/campus-scope-field";

const initialState: ActionState = {};

export function NewIncidentForm({
  requireLocation = true,
  requireSeverity = true,
  medicalSupplies = [],
  teamMembers = [],
  timeZone,
  campuses = [],
  defaultCampusId = "",
  photosEnabled = true,
  photoMaxCount = 2,
  photoMaxBytes = 10 * 1024 * 1024,
  medicalUsageEnabled = true,
}: {
  requireLocation?: boolean;
  requireSeverity?: boolean;
  medicalSupplies?: MedicalSupply[];
  teamMembers?: TeamMemberRow[];
  timeZone?: string | null;
  campuses?: CampusScopeOption[];
  defaultCampusId?: string;
  photosEnabled?: boolean;
  photoMaxCount?: number;
  photoMaxBytes?: number;
  medicalUsageEnabled?: boolean;
}) {
  const router = useRouter();
  const [occurredAt, setOccurredAt] = useState("");
  const [incidentType, setIncidentType] = useState("");
  const [severity, setSeverity] = useState("");
  const [state, formAction, pending] = useActionState(
    createIncident,
    initialState,
  );
  const notifiesByDefault =
    severity === "high" || severity === "critical";

  useEffect(() => {
    setOccurredAt(formatDateTimeLocalValue(new Date(), timeZone));
  }, [timeZone]);

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
                value={incidentType}
                onChange={(event) => setIncidentType(event.target.value)}
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
                value={severity}
                onChange={(event) => setSeverity(event.target.value)}
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

          {notifiesByDefault ? (
            <div className="rounded-md border border-border bg-muted/40 px-3 py-3">
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  name="skip_notification"
                  value="1"
                  className="mt-1 h-4 w-4"
                />
                <span>
                  <span className="font-medium text-foreground">
                    Do not send a notification
                  </span>
                  <span className="mt-0.5 block text-muted-foreground">
                    High and critical incidents normally alert the team. Check
                    this for record-keeping when no alert is needed.
                  </span>
                </span>
              </label>
            </div>
          ) : null}

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

          <CampusScopeField
            campuses={campuses}
            defaultValue={defaultCampusId}
            error={state.fieldErrors?.campus_id}
          />

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

          <IncidentTeamMembersFields members={teamMembers} />
          {state.fieldErrors?.incident_members && (
            <p className="text-sm text-destructive">
              {state.fieldErrors.incident_members}
            </p>
          )}

          {incidentType === "medical" && medicalUsageEnabled && (
            <MedicalSuppliesUsedFields supplies={medicalSupplies} />
          )}
          {incidentType === "medical" && !medicalUsageEnabled && (
            <p className="text-sm text-muted-foreground">
              Recording medical supply usage is not included in your plan.
            </p>
          )}
          {state.fieldErrors?.medical_supplies && (
            <p className="text-sm text-destructive">
              {state.fieldErrors.medical_supplies}
            </p>
          )}

          {photosEnabled ? (
            <IncidentPhotoPicker
              error={state.fieldErrors?.photos}
              maxCount={photoMaxCount}
              maxBytes={photoMaxBytes}
              remainingSlots={photoMaxCount}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              Incident photo uploads are not included in your plan.
            </p>
          )}
          {state.fieldErrors?.photos && !photosEnabled && (
            <p className="text-sm text-destructive">{state.fieldErrors.photos}</p>
          )}

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
