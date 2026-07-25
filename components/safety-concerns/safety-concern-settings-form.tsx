"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { updateSafetyConcernChurchSettingsAction } from "@/app/(app)/settings/safety-concerns/actions";
import {
  LabeledCheckbox,
  LabeledSelect,
} from "@/components/settings/settings-form-shell";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SAFETY_CONCERN_REVIEW_INTERVALS } from "@/lib/safety-concerns/constants";
import type {
  SafetyConcernActionState,
  SafetyConcernChurchSettings,
} from "@/lib/safety-concerns/types";

const initialState: SafetyConcernActionState = {};

const INTERVAL_OPTIONS = SAFETY_CONCERN_REVIEW_INTERVALS.map((days) => ({
  value: String(days),
  label: `${days} days`,
}));

export function SafetyConcernSettingsForm({
  settings,
  canEdit,
}: {
  settings: SafetyConcernChurchSettings;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    updateSafetyConcernChurchSettingsAction,
    initialState,
  );

  useEffect(() => {
    if (state.success) router.refresh();
  }, [state.success, router]);

  return (
    <form action={formAction} className="space-y-6">
      {state.error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
          Safety Concern settings saved.
        </p>
      ) : null}

      <fieldset disabled={!canEdit || pending} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Access controls</CardTitle>
            <CardDescription>
              Who may view Known Safety Concerns when your plan includes the
              feature. Leadership can always manage when entitled.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <LabeledCheckbox
              id="allow_security_member_view"
              name="allow_security_member_view"
              label="Allow security members to view profiles"
              defaultChecked={settings.allow_security_member_view}
              hint="When off, only security leaders and above can open Known Safety Concerns."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Review workflow</CardTitle>
            <CardDescription>
              Default interval used when creating or reviewing active profiles.
              Daily reminders notify leadership when reviews are due.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <LabeledSelect
              id="review_interval_days"
              name="review_interval_days"
              label="Default review interval"
              defaultValue={String(settings.review_interval_days)}
              options={INTERVAL_OPTIONS}
              error={state.fieldErrors?.review_interval_days}
              hint="Applied when a next review date is not set manually."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Activation requirements</CardTitle>
            <CardDescription>
              Optional gates before a profile can move to Active status.
              Profiles can still be saved as draft.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <LabeledCheckbox
              id="require_photo_to_activate"
              name="require_photo_to_activate"
              label="Require a photo to activate"
              defaultChecked={settings.require_photo_to_activate}
              hint="Create as draft, upload a photo, then activate."
            />
            <LabeledCheckbox
              id="require_linked_incident"
              name="require_linked_incident"
              label="Require a linked incident to activate"
              defaultChecked={settings.require_linked_incident}
              hint="Create as draft, link a same-church incident, then activate."
            />
          </CardContent>
        </Card>
      </fieldset>

      {canEdit ? (
        <Button type="submit" disabled={pending} className="h-11">
          {pending ? "Saving…" : "Save settings"}
        </Button>
      ) : (
        <p className="text-sm text-muted-foreground">
          View only. Owners and administrators can edit these settings.
        </p>
      )}
    </form>
  );
}
