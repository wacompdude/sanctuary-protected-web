"use client";

import { useActionState } from "react";
import { archiveSafetyConcernProfile } from "@/app/(app)/safety-concerns/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { SafetyConcernActionState } from "@/lib/safety-concerns/types";

const textareaClassName =
  "flex min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function SafetyConcernArchiveForm({ profileId }: { profileId: string }) {
  const [state, formAction, pending] = useActionState(
    archiveSafetyConcernProfile.bind(null, profileId),
    {} as SafetyConcernActionState,
  );

  return (
    <form action={formAction} className="space-y-3">
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state.success && (
        <p className="text-sm text-green-700 dark:text-green-400">Archived.</p>
      )}
      <div className="space-y-2">
        <Label htmlFor="archive_reason">Archive reason</Label>
        <textarea
          id="archive_reason"
          name="archive_reason"
          className={textareaClassName}
          maxLength={500}
        />
      </div>
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "Archiving…" : "Archive profile"}
      </Button>
    </form>
  );
}
