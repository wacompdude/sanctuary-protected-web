"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { respondToAssignmentAction } from "@/app/(app)/schedule/shift-actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export function AssignmentResponseForm({
  assignmentId,
}: {
  assignmentId: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();
  const noteId = `decline_note_${assignmentId}`;

  function respond(decision: "accept" | "decline") {
    const formData = new FormData();
    formData.set("decision", decision);
    const note = (
      document.getElementById(noteId) as HTMLInputElement | null
    )?.value;
    if (note) formData.set("decline_note", note);

    startTransition(async () => {
      setError(null);
      setSuccess(false);
      const result = await respondToAssignmentAction(
        assignmentId,
        {},
        formData,
      );
      if (result.error) {
        setError(result.error);
        return;
      }
      setSuccess(true);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      {error ? (
        <p className="w-full text-sm text-destructive sm:basis-full">{error}</p>
      ) : null}
      {success ? (
        <p className="w-full text-sm text-emerald-700 dark:text-emerald-300 sm:basis-full">
          Response saved.
        </p>
      ) : null}
      <div className="space-y-1">
        <Label htmlFor={noteId}>Decline note</Label>
        <input
          id={noteId}
          name="decline_note"
          className="flex h-10 w-full min-w-[12rem] rounded-md border border-input bg-background px-3 text-sm"
          placeholder="Optional"
        />
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          disabled={pending}
          onClick={() => respond("accept")}
        >
          Accept
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => respond("decline")}
        >
          Decline
        </Button>
      </div>
    </div>
  );
}
