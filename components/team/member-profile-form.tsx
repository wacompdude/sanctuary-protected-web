"use client";

import { useActionState, useEffect, useRef } from "react";
import { updateMemberProfile } from "@/app/(app)/team/manage-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ProfileActionState } from "@/lib/profile/types";

const initialState: ProfileActionState = {};

export function MemberProfileForm({
  userId,
  email,
  firstName,
  lastName,
  phone,
  onSaved,
}: {
  userId: string;
  email: string | null;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  onSaved?: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    updateMemberProfile,
    initialState,
  );
  const notifiedSuccess = useRef(false);

  useEffect(() => {
    if (!state.success || notifiedSuccess.current) return;
    notifiedSuccess.current = true;
    onSaved?.();
  }, [state.success, onSaved]);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="user_id" value={userId} />
      {state.error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="rounded-md border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-400">
          Member details saved.
        </p>
      ) : null}

      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">Email</p>
        <p className="text-sm">{email ?? "—"}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`first_name_${userId}`}>First name</Label>
          <Input
            id={`first_name_${userId}`}
            name="first_name"
            defaultValue={firstName ?? ""}
            autoComplete="given-name"
            aria-invalid={!!state.fieldErrors?.first_name}
          />
          {state.fieldErrors?.first_name ? (
            <p className="text-sm text-destructive">
              {state.fieldErrors.first_name}
            </p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor={`last_name_${userId}`}>Last name</Label>
          <Input
            id={`last_name_${userId}`}
            name="last_name"
            defaultValue={lastName ?? ""}
            autoComplete="family-name"
            aria-invalid={!!state.fieldErrors?.last_name}
          />
          {state.fieldErrors?.last_name ? (
            <p className="text-sm text-destructive">
              {state.fieldErrors.last_name}
            </p>
          ) : null}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`phone_${userId}`}>Phone</Label>
        <Input
          id={`phone_${userId}`}
          name="phone"
          type="tel"
          defaultValue={phone ?? ""}
          autoComplete="tel"
          placeholder="Optional"
        />
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save details"}
      </Button>
    </form>
  );
}
