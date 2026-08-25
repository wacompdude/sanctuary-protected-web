"use client";

import { useActionState } from "react";
import { reviewSafetyConcernProfile } from "@/app/(app)/safety-concerns/actions";
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
import { SAFETY_CONCERN_REVIEW_OUTCOMES } from "@/lib/safety-concerns/constants";
import type { SafetyConcernActionState } from "@/lib/safety-concerns/types";
import { selectClassName } from "@/components/ui/form-control";

const textareaClassName =
  "flex min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function SafetyConcernReviewForm({ profileId }: { profileId: string }) {
  const [state, formAction, pending] = useActionState(
    reviewSafetyConcernProfile.bind(null, profileId),
    {} as SafetyConcernActionState,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Complete review</CardTitle>
        <CardDescription>
          Confirm continued need, accuracy, and response guidance.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          {state.error && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}
          {state.success && (
            <p className="text-sm text-green-700 dark:text-green-400">
              Review recorded.
            </p>
          )}
          <div className="space-y-2">
            <Label htmlFor="outcome">Outcome</Label>
            <select
              id="outcome"
              name="outcome"
              className={selectClassName}
              defaultValue="confirmed_active"
            >
              {SAFETY_CONCERN_REVIEW_OUTCOMES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="new_next_review_date">Next review date</Label>
            <Input
              id="new_next_review_date"
              name="new_next_review_date"
              type="date"
            />
            <p className="text-xs text-muted-foreground">
              Leave blank to use the church default review interval.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Review notes</Label>
            <textarea
              id="notes"
              name="notes"
              className={textareaClassName}
              maxLength={2000}
            />
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save review"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
