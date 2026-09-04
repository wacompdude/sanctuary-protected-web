"use client";

import { useActionState, useState, useTransition } from "react";
import {
  removeBackupPhoneAction,
  startBackupPhoneAction,
  verifyBackupPhoneAction,
} from "@/app/(app)/profile/mfa-actions";
import { OtpCodeInput } from "@/components/mfa/otp-code-input";
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
import type { MfaActionState } from "@/lib/mfa/types";

const initialState: MfaActionState = {};

export function ProfileMfaSettings({
  maskedPhone,
  hasVerifiedPhone,
  smsConfigured,
  profilePhone,
  policyNotice,
}: {
  maskedPhone: string | null;
  hasVerifiedPhone: boolean;
  smsConfigured: boolean;
  profilePhone: string | null;
  policyNotice?: string | null;
}) {
  const [startState, startAction, startPending] = useActionState(
    startBackupPhoneAction,
    initialState,
  );
  const [verifyState, verifyAction, verifyPending] = useActionState(
    verifyBackupPhoneAction,
    initialState,
  );
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [removing, startRemove] = useTransition();

  const awaitingCode = Boolean(startState.success && startState.view && !verifyState.verified);
  const error =
    verifyState.error || startState.error || removeError || null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign-in verification</CardTitle>
        <CardDescription>
          After your password, we send a 6-digit code to your email unless this
          browser is a trusted device. You can add a verified mobile number as
          a backup if you cannot access that inbox.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {policyNotice ? (
          <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            {policyNotice}
          </p>
        ) : null}
        {error ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {verifyState.verified ? (
          <p className="rounded-md border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-400">
            Backup phone verified. You can use it at sign-in if you cannot
            access your email.
          </p>
        ) : null}

        <div className="rounded-md border border-border px-3 py-3 text-sm">
          <p className="font-medium">Email code</p>
          <p className="mt-1 text-muted-foreground">
            Sent to your account email after password sign-in from a new or
            unrecognized device. Trusted devices can skip this code until they
            expire or you remove them.
          </p>
        </div>

        <div className="rounded-md border border-border px-3 py-3 text-sm">
          <p className="font-medium">Text message backup</p>
          {hasVerifiedPhone && maskedPhone ? (
            <p className="mt-1 text-muted-foreground">
              Verified number: {maskedPhone}
            </p>
          ) : (
            <p className="mt-1 text-muted-foreground">
              No verified backup number yet. A phone typed at login is never
              trusted.
            </p>
          )}
        </div>

        {!smsConfigured ? (
          <p className="text-sm text-muted-foreground">
            Text message delivery is not connected yet. You can still complete
            sign-in with the email code.
          </p>
        ) : null}

        {awaitingCode ? (
          <form action={verifyAction} className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Enter the 6-digit code sent to {startState.view?.maskedDestination}.
            </p>
            {startState.view?.devCode ? (
              <p className="text-xs text-muted-foreground">
                Development delivery: {startState.view.devCode}
              </p>
            ) : null}
            <OtpCodeInput
              disabled={verifyPending}
              error={!!verifyState.fieldErrors?.code}
            />
            <Button type="submit" disabled={verifyPending}>
              {verifyPending ? "Verifying..." : "Verify phone"}
            </Button>
          </form>
        ) : (
          <form action={startAction} className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="mfa_phone">Mobile number</Label>
              <Input
                id="mfa_phone"
                name="phone"
                type="tel"
                autoComplete="tel"
                placeholder="+14255551234"
                defaultValue={profilePhone ?? ""}
                aria-invalid={!!startState.fieldErrors?.phone}
              />
              {startState.fieldErrors?.phone ? (
                <p className="text-sm text-destructive">
                  {startState.fieldErrors.phone}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Stored in international format after it is verified. We will
                  text this number to confirm it is yours.
                </p>
              )}
            </div>
            <Button type="submit" disabled={startPending || !smsConfigured}>
              {startPending
                ? "Sending..."
                : hasVerifiedPhone
                  ? "Verify a new backup number"
                  : "Send verification text"}
            </Button>
          </form>
        )}

        {hasVerifiedPhone ? (
          <Button
            type="button"
            variant="outline"
            disabled={removing}
            onClick={() => {
              startRemove(async () => {
                setRemoveError(null);
                const result = await removeBackupPhoneAction();
                if (result.error) setRemoveError(result.error);
              });
            }}
          >
            {removing ? "Removing..." : "Remove backup phone"}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
