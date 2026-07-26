"use client";

import { useActionState } from "react";
import { setHelpArticleReviewDueAction } from "@/app/platform/help-actions";
import { PlatformButton } from "@/components/platform/platform-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { HelpActionState } from "@/lib/help/types";

const initialState: HelpActionState = {};

export function HelpReviewDueForm({
  articleId,
  reviewDueAt,
}: {
  articleId: string;
  reviewDueAt?: string | null;
}) {
  const [state, formAction, pending] = useActionState(
    setHelpArticleReviewDueAction,
    initialState,
  );

  const defaultDate = reviewDueAt
    ? reviewDueAt.slice(0, 10)
    : "";

  return (
    <form
      action={formAction}
      className="space-y-3 rounded-lg border border-slate-800 bg-slate-950/40 p-4"
    >
      <input type="hidden" name="article_id" value={articleId} />
      <div>
        <h2 className="text-lg font-semibold">Review reminder</h2>
        <p className="text-sm text-slate-400">
          Set a review due date for content freshness checks.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="help-review-due">Review due date</Label>
        <Input
          id="help-review-due"
          name="review_due_at"
          type="date"
          defaultValue={defaultDate}
          className="max-w-xs border-slate-700 bg-slate-900"
        />
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-300">
        <input type="checkbox" name="mark_reviewed" value="true" />
        Mark reviewed today
      </label>
      {state.error ? (
        <p className="text-sm text-rose-400">{state.error}</p>
      ) : null}
      {state.success ? (
        <p className="text-sm text-emerald-400">{state.success}</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <PlatformButton type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save review schedule"}
        </PlatformButton>
      </div>
    </form>
  );
}
