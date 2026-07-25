"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  deleteChurchThreatLevelEntry,
  editChurchThreatLevelEntry,
  updateChurchThreatLevel,
} from "@/app/(app)/dashboard/threat-level/actions";
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
  weekStartsOnLabel = "Sunday",
  weekEndsOnLabel = "Saturday",
  entryId = null,
  onCancelEdit,
}: {
  defaultWeekStart: string;
  defaultThreatLevel?: ThreatLevel;
  defaultNotes?: string | null;
  weekStartsOnLabel?: string;
  weekEndsOnLabel?: string;
  /** When set, saves by editing this row instead of creating a new entry. */
  entryId?: string | null;
  onCancelEdit?: () => void;
}) {
  const router = useRouter();
  const isEdit = Boolean(entryId);
  const [state, formAction, pending] = useActionState(
    isEdit ? editChurchThreatLevelEntry : updateChurchThreatLevel,
    initialState,
  );

  useEffect(() => {
    if (state.success) {
      router.refresh();
      onCancelEdit?.();
    }
  }, [router, state.success, onCancelEdit]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {isEdit ? "Edit threat level entry" : "Change weekly threat level"}
        </CardTitle>
        <CardDescription>
          {isEdit
            ? `Update this existing entry in place. Weeks begin on ${weekStartsOnLabel}.`
            : `Save a new weekly threat level entry. Pick any date in the week you want covered — it is stored as the week beginning on ${weekStartsOnLabel}. Each change is recorded with the user, timestamp, and optional notes.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4" noValidate>
          {entryId ? (
            <input type="hidden" name="entry_id" value={entryId} />
          ) : null}
          {state.error && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {state.error}
            </p>
          )}
          {state.success && (
            <p className="rounded-md border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-400">
              {isEdit
                ? "Threat level entry updated."
                : "Threat level updated successfully."}
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
              <p className="text-xs text-muted-foreground">
                Any date in the target week. Weeks run {weekStartsOnLabel}–
                {weekEndsOnLabel}.
              </p>
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

          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              disabled={pending}
              className="h-11 w-full sm:w-auto"
            >
              {pending
                ? "Saving..."
                : isEdit
                  ? "Save changes"
                  : "Save threat level"}
            </Button>
            {isEdit && onCancelEdit ? (
              <Button
                type="button"
                variant="outline"
                className="h-11"
                disabled={pending}
                onClick={onCancelEdit}
              >
                Cancel
              </Button>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export function ThreatLevelManagePanel({
  defaultWeekStart,
  defaultThreatLevel = "green",
  defaultNotes = "",
  weekStartsOnLabel = "Sunday",
  weekEndsOnLabel = "Saturday",
  currentEntryId = null,
  currentWeekStart = null,
  currentThreatLevel = "green",
  currentNotes = "",
}: {
  defaultWeekStart: string;
  defaultThreatLevel?: ThreatLevel;
  defaultNotes?: string | null;
  weekStartsOnLabel?: string;
  weekEndsOnLabel?: string;
  currentEntryId?: string | null;
  currentWeekStart?: string | null;
  currentThreatLevel?: ThreatLevel;
  currentNotes?: string | null;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);

  if (editingId && currentEntryId && editingId === currentEntryId) {
    return (
      <ThreatLevelForm
        key={editingId}
        entryId={editingId}
        defaultWeekStart={currentWeekStart || defaultWeekStart}
        defaultThreatLevel={currentThreatLevel}
        defaultNotes={currentNotes}
        weekStartsOnLabel={weekStartsOnLabel}
        weekEndsOnLabel={weekEndsOnLabel}
        onCancelEdit={() => setEditingId(null)}
      />
    );
  }

  return (
    <div className="space-y-3">
      {currentEntryId ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setEditingId(currentEntryId)}
          >
            Edit current entry
          </Button>
        </div>
      ) : null}
      <ThreatLevelForm
        key="create"
        defaultWeekStart={defaultWeekStart}
        defaultThreatLevel={defaultThreatLevel}
        defaultNotes={defaultNotes}
        weekStartsOnLabel={weekStartsOnLabel}
        weekEndsOnLabel={weekEndsOnLabel}
      />
    </div>
  );
}

export function ThreatLevelDeleteButton({
  entryId,
  weekLabel,
}: {
  entryId: string;
  weekLabel: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onDelete() {
    const confirmed = window.confirm(
      `Delete the threat level entry for week of ${weekLabel}? This cannot be undone.`,
    );
    if (!confirmed) return;

    setPending(true);
    setError(null);
    const formData = new FormData();
    formData.set("entry_id", entryId);
    const result = await deleteChurchThreatLevelEntry(formData);
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="text-destructive hover:text-destructive"
        disabled={pending}
        onClick={onDelete}
      >
        {pending ? "Deleting…" : "Delete"}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
