"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  setPrimaryCampusAction,
  updateCampusStatusAction,
} from "@/app/(app)/campuses/actions";
import { LabeledSelect } from "@/components/settings/settings-form-shell";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CAMPUS_STATUSES } from "@/lib/campuses/constants";
import type { Campus, CampusActionState } from "@/lib/campuses/types";

const initialState: CampusActionState = {};

export function CampusSettingsPanel({
  campus,
  canManage,
  extendedSchema,
}: {
  campus: Campus;
  canManage: boolean;
  extendedSchema: boolean;
}) {
  const router = useRouter();
  const boundStatusAction = updateCampusStatusAction.bind(null, campus.id);
  const [state, formAction, pending] = useActionState(
    boundStatusAction,
    initialState,
  );
  const [primaryPending, startPrimary] = useTransition();
  const [primaryError, setPrimaryError] = useState<string | null>(null);

  useEffect(() => {
    if (state.success) router.refresh();
  }, [state.success, router]);

  function handleSetPrimary() {
    setPrimaryError(null);
    startPrimary(async () => {
      const result = await setPrimaryCampusAction(campus.id);
      if (result.error) {
        setPrimaryError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {extendedSchema ? (
        <Card>
          <CardHeader>
            <CardTitle>Primary campus</CardTitle>
            <CardDescription>
              The primary campus is the default location for church-wide
              operations when a specific campus is not selected.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {campus.is_primary ? (
              <p className="text-sm text-muted-foreground">
                This is the primary campus for the church.
              </p>
            ) : (
              <>
                {primaryError ? (
                  <p
                    className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                    role="alert"
                  >
                    {primaryError}
                  </p>
                ) : null}
                {canManage ? (
                  <Button
                    type="button"
                    className="h-11"
                    disabled={
                      primaryPending ||
                      campus.status === "archived" ||
                      campus.status === "closed"
                    }
                    onClick={handleSetPrimary}
                  >
                    {primaryPending ? "Updating…" : "Make primary campus"}
                  </Button>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Administrators can change the primary campus.
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Status</CardTitle>
          <CardDescription>
            Archive or close a campus only after setting another campus as
            primary. Historical records remain linked.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="space-y-4" noValidate>
            {state.error ? (
              <p
                className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                role="alert"
              >
                {state.error}
              </p>
            ) : null}
            {state.success ? (
              <p className="rounded-md border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-400">
                Status updated.
              </p>
            ) : null}

            <fieldset disabled={!canManage || pending} className="space-y-4">
              <LabeledSelect
                id="status"
                name="status"
                label="Campus status"
                defaultValue={campus.status}
                options={
                  extendedSchema
                    ? CAMPUS_STATUSES
                    : CAMPUS_STATUSES.filter(
                        (item) =>
                          item.value === "active" || item.value === "inactive",
                      )
                }
                error={state.fieldErrors?.status}
              />
            </fieldset>

            {canManage ? (
              <Button type="submit" disabled={pending} className="h-11">
                {pending ? "Saving…" : "Update status"}
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">
                View only. Administrators can change campus status.
              </p>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
