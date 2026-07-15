"use client";

import { useActionState, useEffect, useRef } from "react";
import { changeOwnPassword } from "@/app/(app)/profile/actions";
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
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/validation";
import type { ChangePasswordActionState } from "@/lib/profile/types";

const initialState: ChangePasswordActionState = {};

export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState(
    changeOwnPassword,
    initialState,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
    }
  }, [state.success]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Change password</CardTitle>
        <CardDescription>
          Enter your current password, then choose a new one. Use at least{" "}
          {MIN_PASSWORD_LENGTH} characters.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form ref={formRef} action={formAction} className="space-y-4">
          {state.error && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {state.error}
            </p>
          )}
          {state.success && (
            <p className="rounded-md border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-400">
              Password updated.
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="current_password">Current password</Label>
            <Input
              id="current_password"
              name="current_password"
              type="password"
              autoComplete="current-password"
              required
              aria-invalid={!!state.fieldErrors?.current_password}
            />
            {state.fieldErrors?.current_password && (
              <p className="text-sm text-destructive">
                {state.fieldErrors.current_password}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="new_password">New password</Label>
            <Input
              id="new_password"
              name="new_password"
              type="password"
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
              required
              aria-invalid={!!state.fieldErrors?.new_password}
            />
            {state.fieldErrors?.new_password && (
              <p className="text-sm text-destructive">
                {state.fieldErrors.new_password}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm_password">Confirm new password</Label>
            <Input
              id="confirm_password"
              name="confirm_password"
              type="password"
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
              required
              aria-invalid={!!state.fieldErrors?.confirm_password}
            />
            {state.fieldErrors?.confirm_password && (
              <p className="text-sm text-destructive">
                {state.fieldErrors.confirm_password}
              </p>
            )}
          </div>

          <Button type="submit" disabled={pending}>
            {pending ? "Updating…" : "Update password"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
