"use client";

import { useActionState } from "react";
import { uploadSafetyConcernPhoto } from "@/app/(app)/safety-concerns/actions";
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
import { SAFETY_CONCERN_PHOTO_SOURCES } from "@/lib/safety-concerns/constants";
import type { SafetyConcernActionState } from "@/lib/safety-concerns/types";
import { selectClassName } from "@/components/ui/form-control";

const textareaClassName =
  "flex min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function SafetyConcernPhotoForm({
  profileId,
  maxCount,
  maxSizeMb,
  currentCount,
}: {
  profileId: string;
  maxCount: number;
  maxSizeMb: number;
  currentCount: number;
}) {
  const [state, formAction, pending] = useActionState(
    uploadSafetyConcernPhoto.bind(null, profileId),
    {} as SafetyConcernActionState,
  );
  const remaining = Math.max(0, maxCount - currentCount);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload photo</CardTitle>
        <CardDescription>
          JPEG, PNG, or WebP · up to {maxSizeMb} MB · {remaining} remaining of{" "}
          {maxCount}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {remaining === 0 ? (
          <p className="text-sm text-muted-foreground">
            Photo limit reached for this profile.
          </p>
        ) : (
          <form action={formAction} className="space-y-4">
            {state.error && (
              <p className="text-sm text-destructive">{state.error}</p>
            )}
            {state.success && (
              <p className="text-sm text-green-700 dark:text-green-400">
                Photo uploaded.
              </p>
            )}
            <div className="space-y-2">
              <Label htmlFor="photos">Photo file</Label>
              <Input
                id="photos"
                name="photos"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                required
              />
              {state.fieldErrors?.photos && (
                <p className="text-sm text-destructive">
                  {state.fieldErrors.photos}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="photo_context_note">Photo context note</Label>
              <textarea
                id="photo_context_note"
                name="photo_context_note"
                className={textareaClassName}
                maxLength={500}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="source_type">Source</Label>
              <select
                id="source_type"
                name="source_type"
                className={selectClassName}
                defaultValue="church_provided"
              >
                {SAFETY_CONCERN_PHOTO_SOURCES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="source_reference">Source reference</Label>
              <Input id="source_reference" name="source_reference" maxLength={500} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="is_primary" />
              Set as primary photo
            </label>
            <Button type="submit" disabled={pending}>
              {pending ? "Uploading…" : "Upload photo"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
