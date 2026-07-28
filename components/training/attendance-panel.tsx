"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  bulkUpdateParticipantAttendance,
  completeParticipant,
  markParticipantsComplete,
} from "@/app/(app)/training/actions";
import { AttendanceStatusBadge, CompletionStatusBadge } from "@/components/training/status-badges";
import { TRAINING_ATTENDANCE_STATUS_LABELS } from "@/lib/training/constants";
import type { TrainingParticipant } from "@/lib/training/types";
import { cn } from "@/lib/utils";

export function AttendancePanel({
  eventId,
  participants,
  canManage,
  missingRequiredUserIds = [],
}: {
  eventId: string;
  participants: TrainingParticipant[];
  canManage: boolean;
  /** User IDs still missing a completion for this event's required course. */
  missingRequiredUserIds?: string[];
}) {
  const missingSet = useMemo(
    () => new Set(missingRequiredUserIds),
    [missingRequiredUserIds],
  );
  const [rows, setRows] = useState(participants);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function updateLocal(id: string, attendanceStatus: string) {
    setRows((current) =>
      current.map((row) =>
        row.id === id
          ? { ...row, attendance_status: attendanceStatus as TrainingParticipant["attendance_status"] }
          : row,
      ),
    );
  }

  function saveAttendance() {
    startTransition(async () => {
      const result = await bulkUpdateParticipantAttendance(
        eventId,
        rows.map((row) => ({
          participantId: row.id,
          attendanceStatus: row.attendance_status,
        })),
      );
      setMessage(result.success ?? result.error ?? null);
    });
  }

  function markComplete(participantId: string) {
    startTransition(async () => {
      const result = await completeParticipant(participantId);
      setMessage(result.success ?? result.error ?? null);
    });
  }

  function markAllComplete() {
    startTransition(async () => {
      const result = await markParticipantsComplete(
        eventId,
        rows.map((row) => row.id),
      );
      setMessage(result.success ?? result.error ?? null);
    });
  }

  if (participants.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No participants enrolled yet.
      </p>
    );
  }

  const missingEnrolledCount = rows.filter((row) =>
    missingSet.has(row.user_id),
  ).length;

  return (
    <div className="space-y-4">
      {message ? (
        <p className="rounded-md border px-3 py-2 text-sm">{message}</p>
      ) : null}

      {missingEnrolledCount > 0 ? (
        <p className="text-xs text-red-700 dark:text-red-300">
          {missingEnrolledCount} enrolled{" "}
          {missingEnrolledCount === 1 ? "member still needs" : "members still need"}{" "}
          this required training (highlighted in red).
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b bg-muted/40 text-left">
            <tr>
              <th className="px-3 py-2 font-medium">Member</th>
              <th className="px-3 py-2 font-medium">Attendance</th>
              <th className="px-3 py-2 font-medium">Completion</th>
              {canManage ? <th className="px-3 py-2 font-medium">Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((participant) => {
              const missing = missingSet.has(participant.user_id);
              return (
              <tr
                key={participant.id}
                className={cn(
                  "border-b last:border-0",
                  missing ? "bg-red-50 dark:bg-red-950/30" : null,
                )}
              >
                <td className="px-3 py-2">
                  <div
                    className={cn(
                      "inline-flex max-w-full flex-col rounded-md border px-2.5 py-1.5",
                      missing
                        ? "border-red-500/70 bg-red-50 text-red-950 dark:bg-red-950/40 dark:text-red-50"
                        : "border-transparent",
                    )}
                  >
                    <span className="font-medium">
                      {participant.member_name ?? "Unknown member"}
                    </span>
                    {participant.member_email ? (
                      <span
                        className={cn(
                          "text-xs",
                          missing
                            ? "text-red-700 dark:text-red-300"
                            : "text-muted-foreground",
                        )}
                      >
                        {participant.member_email}
                      </span>
                    ) : null}
                    {missing ? (
                      <span className="text-xs font-medium text-red-700 dark:text-red-300">
                        Missing required training
                      </span>
                    ) : null}
                  </div>
                </td>
                <td className="px-3 py-2">
                  {canManage ? (
                    <select
                      value={participant.attendance_status}
                      onChange={(event) =>
                        updateLocal(participant.id, event.target.value)
                      }
                      className="rounded-md border border-input bg-background px-2 py-1 text-sm"
                    >
                      {Object.entries(TRAINING_ATTENDANCE_STATUS_LABELS).map(
                        ([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ),
                      )}
                    </select>
                  ) : (
                    <AttendanceStatusBadge status={participant.attendance_status} />
                  )}
                </td>
                <td className="px-3 py-2">
                  <CompletionStatusBadge status={participant.completion_status} />
                </td>
                {canManage ? (
                  <td className="px-3 py-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => markComplete(participant.id)}
                    >
                      Mark complete
                    </Button>
                  </td>
                ) : null}
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {canManage ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={pending} onClick={saveAttendance}>
            Save attendance
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={markAllComplete}
          >
            Mark all complete
          </Button>
        </div>
      ) : null}
    </div>
  );
}
