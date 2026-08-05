"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { addParticipants } from "@/app/(app)/training/actions";
import type { TeamMemberRow } from "@/lib/organization/team";
import { cn } from "@/lib/utils";

export function AddParticipantsForm({
  eventId,
  members,
  existingUserIds,
  missingRequiredUserIds = [],
}: {
  eventId: string;
  members: TeamMemberRow[];
  existingUserIds: string[];
  /** User IDs still missing a completion for this event's required course. */
  missingRequiredUserIds?: string[];
}) {
  const missingSet = useMemo(
    () => new Set(missingRequiredUserIds),
    [missingRequiredUserIds],
  );

  const available = useMemo(() => {
    const rows = members.filter(
      (member) => !existingUserIds.includes(member.userId),
    );
    return rows.sort((a, b) => {
      const aMissing = missingSet.has(a.userId) ? 0 : 1;
      const bMissing = missingSet.has(b.userId) ? 0 : 1;
      if (aMissing !== bMissing) return aMissing - bMissing;
      return a.name.localeCompare(b.name);
    });
  }, [members, existingUserIds, missingSet]);

  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle(userId: string) {
    setSelected((current) =>
      current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId],
    );
  }

  function submit() {
    startTransition(async () => {
      const result = await addParticipants(eventId, selected);
      setMessage(result.success ?? result.error ?? null);
      if (result.success) setSelected([]);
    });
  }

  if (available.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        All active members are already enrolled.
      </p>
    );
  }

  const missingAvailableCount = available.filter((m) =>
    missingSet.has(m.userId),
  ).length;

  return (
    <div className="space-y-3 rounded-md border p-4">
      <div className="space-y-1">
        <p className="text-sm font-medium">Add participants</p>
        {missingAvailableCount > 0 ? (
          <p className="text-xs text-red-700 dark:text-red-300">
            Red tiles still need this required training — enroll them in this
            event or another scheduled session.
          </p>
        ) : null}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {available.map((member) => {
          const missing = missingSet.has(member.userId);
          return (
            <label
              key={member.userId}
              className={cn(
                "flex items-center gap-2 rounded-md border px-3 py-2 text-sm",
                missing
                  ? "border-red-500/70 bg-red-50 text-red-950 dark:bg-red-950/40 dark:text-red-50"
                  : null,
              )}
            >
              <input
                type="checkbox"
                checked={selected.includes(member.userId)}
                onChange={() => toggle(member.userId)}
              />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{member.name}</span>
                {missing ? (
                  <span className="block text-xs text-red-700 dark:text-red-300">
                    Missing required training
                  </span>
                ) : null}
              </span>
            </label>
          );
        })}
      </div>
      {message ? <p className="text-sm">{message}</p> : null}
      <Button
        type="button"
        size="sm"
        disabled={pending || selected.length === 0}
        onClick={submit}
      >
        Add selected
      </Button>
    </div>
  );
}
