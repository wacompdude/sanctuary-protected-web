"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { ActionState } from "@/lib/church/types";
import { EMAIL_SENDER_CATEGORIES, EMAIL_SENDER_LABELS } from "@/lib/email/email-sender-types";
import { updateTemplateSenderCategoryAction } from "@/app/(app)/notifications/template-actions";

const initialState: ActionState = {};

const CHURCH_EDITABLE_CATEGORIES = EMAIL_SENDER_CATEGORIES.filter(
  (category) => category !== "emergency",
);

export function TemplateSenderCategoryForm({
  templateId,
  templateKey,
  currentCategory,
  canEdit,
  canAssignEmergency,
}: {
  templateId: string;
  templateKey: string;
  currentCategory: string | null;
  canEdit: boolean;
  canAssignEmergency: boolean;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    updateTemplateSenderCategoryAction,
    initialState,
  );

  useEffect(() => {
    if (state.success) router.refresh();
  }, [state.success, router]);

  if (!canEdit) {
    return (
      <p className="text-sm text-muted-foreground">
        Sender:{" "}
        {currentCategory
          ? EMAIL_SENDER_LABELS[
              currentCategory as keyof typeof EMAIL_SENDER_LABELS
            ] ?? currentCategory
          : "Platform default (by notification type)"}
      </p>
    );
  }

  const options = canAssignEmergency
    ? EMAIL_SENDER_CATEGORIES
    : CHURCH_EDITABLE_CATEGORIES;

  return (
    <form action={formAction} className="mt-3 space-y-2 border-t border-border pt-3">
      <input type="hidden" name="template_id" value={templateId} />
      {state.error ? (
        <p className="text-sm text-destructive">{state.error}</p>
      ) : null}
      {state.success ? (
        <p className="text-sm text-green-700 dark:text-green-400">
          Sender category updated.
        </p>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1 space-y-1">
          <Label htmlFor={`sender-${templateId}`}>
            Default sender (hint for unmapped types)
          </Label>
          <select
            id={`sender-${templateId}`}
            name="default_sender_category"
            defaultValue={currentCategory ?? ""}
            disabled={pending}
            className="flex min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-base md:h-9 md:min-h-0 md:text-sm"
          >
            <option value="">Use notification-type map / alerts</option>
            {options.map((category) => (
              <option key={category} value={category}>
                {EMAIL_SENDER_LABELS[category]}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            Does not override stricter mapped types for {templateKey}.
          </p>
        </div>
        <Button type="submit" variant="outline" disabled={pending} className="h-11 sm:h-9">
          {pending ? "Saving…" : "Save sender"}
        </Button>
      </div>
    </form>
  );
}
