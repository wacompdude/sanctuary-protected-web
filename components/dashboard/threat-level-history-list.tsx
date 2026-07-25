"use client";

import { useState } from "react";
import { ThreatLevelDeleteButton, ThreatLevelForm } from "@/components/dashboard/threat-level-form";
import {
  formatThreatWeek,
  labelForThreatLevel,
  threatLevelBadgeClassName,
  threatLevelBadgeStyle,
  type ChurchThreatLevelHistoryEntry,
  type ThreatLevel,
} from "@/lib/church/threat-levels";
import { formatDateTime } from "@/lib/incidents/format";
import { Button } from "@/components/ui/button";

export function ThreatLevelHistoryList({
  entries,
  timeZone,
  emptyMessage = "No threat level history has been recorded yet.",
  canManage = false,
  weekStartsOnLabel = "Sunday",
  weekEndsOnLabel = "Saturday",
}: {
  entries: ChurchThreatLevelHistoryEntry[];
  timeZone: string;
  emptyMessage?: string;
  canManage?: boolean;
  weekStartsOnLabel?: string;
  weekEndsOnLabel?: string;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);

  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <ul className="space-y-3">
      {entries.map((entry) => {
        const weekLabel = formatThreatWeek(entry.week_start, timeZone);
        if (canManage && editingId === entry.id) {
          return (
            <li key={entry.id} className="rounded-md border border-border p-3">
              <ThreatLevelForm
                entryId={entry.id}
                defaultWeekStart={entry.week_start}
                defaultThreatLevel={entry.threat_level as ThreatLevel}
                defaultNotes={entry.notes}
                weekStartsOnLabel={weekStartsOnLabel}
                weekEndsOnLabel={weekEndsOnLabel}
                onCancelEdit={() => setEditingId(null)}
              />
            </li>
          );
        }

        return (
          <li
            key={entry.id}
            className="rounded-md border border-border px-3 py-3"
          >
            <div className="flex flex-wrap items-center gap-3">
              <span
                className={threatLevelBadgeClassName(entry.threat_level)}
                style={threatLevelBadgeStyle(entry.threat_level)}
              >
                {labelForThreatLevel(entry.threat_level)}
              </span>
              <p className="text-sm font-medium">Week of {weekLabel}</p>
            </div>
            {entry.notes ? (
              <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">
                {entry.notes}
              </p>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                No notes recorded.
              </p>
            )}
            <p className="mt-2 text-sm text-muted-foreground">
              Recorded by {entry.changed_by_name}
              {entry.changed_by_email ? ` (${entry.changed_by_email})` : ""} on{" "}
              {formatDateTime(entry.created_at, null, timeZone)}.
              {entry.updated_at
                ? ` Last edited ${formatDateTime(entry.updated_at, null, timeZone)}.`
                : ""}
            </p>
            {canManage ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setEditingId(entry.id)}
                >
                  Edit
                </Button>
                <ThreatLevelDeleteButton
                  entryId={entry.id}
                  weekLabel={weekLabel}
                />
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
