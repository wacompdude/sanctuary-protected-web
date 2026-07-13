"use client";

import { useActionState } from "react";
import { updateOwnProfile } from "@/app/(app)/profile/actions";
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
import type { ProfileActionState, UserProfile } from "@/lib/profile/types";

const initialState: ProfileActionState = {};

export function ProfileForm({ profile }: { profile: UserProfile }) {
  const [state, formAction, pending] = useActionState(
    updateOwnProfile,
    initialState,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your details</CardTitle>
        <CardDescription>
          Update your name and phone. Church roles are managed separately by
          your administrators.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          {state.error && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {state.error}
            </p>
          )}
          {state.success && (
            <p className="rounded-md border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-400">
              Profile saved.
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="first_name">First name</Label>
              <Input
                id="first_name"
                name="first_name"
                defaultValue={profile.first_name ?? ""}
                autoComplete="given-name"
                aria-invalid={!!state.fieldErrors?.first_name}
              />
              {state.fieldErrors?.first_name && (
                <p className="text-sm text-destructive">
                  {state.fieldErrors.first_name}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="last_name">Last name</Label>
              <Input
                id="last_name"
                name="last_name"
                defaultValue={profile.last_name ?? ""}
                autoComplete="family-name"
                aria-invalid={!!state.fieldErrors?.last_name}
              />
              {state.fieldErrors?.last_name && (
                <p className="text-sm text-destructive">
                  {state.fieldErrors.last_name}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              name="phone"
              type="tel"
              defaultValue={profile.phone ?? ""}
              autoComplete="tel"
              placeholder="Optional"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="avatar_url">Avatar</Label>
            <Input
              id="avatar_url"
              value={profile.avatar_url ?? ""}
              disabled
              readOnly
            />
            <p className="text-xs text-muted-foreground">
              Avatar upload will be available in a later step.
            </p>
          </div>

          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save profile"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
