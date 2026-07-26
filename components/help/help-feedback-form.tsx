"use client";

import { useActionState, useState } from "react";
import { submitHelpFeedbackAction } from "@/app/(app)/help/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { HelpActionState } from "@/lib/help/types";

const initialState: HelpActionState = {};

export function HelpFeedbackForm({
  articleId,
  articleSlug,
  articleVersionId,
}: {
  articleId: string;
  articleSlug: string;
  articleVersionId?: string | null;
}) {
  const [state, formAction, pending] = useActionState(
    submitHelpFeedbackAction,
    initialState,
  );
  const [rating, setRating] = useState<"yes" | "no" | null>(null);

  if (state.success) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        {state.success}
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="article_id" value={articleId} />
      <input type="hidden" name="article_slug" value={articleSlug} />
      {articleVersionId ? (
        <input
          type="hidden"
          name="article_version_id"
          value={articleVersionId}
        />
      ) : null}
      {rating ? <input type="hidden" name="rating" value={rating} /> : null}

      <p className="text-sm font-medium">Was this article helpful?</p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant={rating === "yes" ? "default" : "outline"}
          size="sm"
          disabled={pending}
          onClick={() => setRating("yes")}
        >
          Yes
        </Button>
        <Button
          type="button"
          variant={rating === "no" ? "default" : "outline"}
          size="sm"
          disabled={pending}
          onClick={() => setRating("no")}
        >
          No
        </Button>
      </div>

      {rating === "no" ? (
        <div className="space-y-2">
          <Label htmlFor="help-feedback-comment">
            What was missing or unclear? (optional)
          </Label>
          <textarea
            id="help-feedback-comment"
            name="comment"
            rows={3}
            maxLength={2000}
            className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </div>
      ) : null}

      {rating ? (
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Sending…" : "Submit feedback"}
        </Button>
      ) : null}

      {state.error ? (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
