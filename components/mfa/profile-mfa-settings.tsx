"use client";

import { useActionState } from "react";
import {
  removeBackupPhoneAction,
  startBackupPhoneAction,
  verifyBackupPhoneAction,
} from "@/app/(app)/profile/mfa-actions";
import { OtpCodeInput } from "@/components/mfa/otp-code-input";
import { SignInVerificationCard } from "@/components/mfa/sign-in-verification-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  MFA_NO_BACKUP_NUMBER,
  MFA_PHONE_FIELD_HELPER,
  MFA_SEND_VERIFICATION_LABEL,
} from "@/lib/mfa/copy";
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
  const [removeState, removeAction, removePending] = useActionState(
    removeBackupPhoneAction,
    initialState,
  );
  const awaitingCode = Boolean(startState.success && startState.view && !verifyState.verified);
  const error =
    verifyState.error || startState.error || removeState.error || null;

  return (
    <SignInVerificationCard
      policyNotice={policyNotice}
      backupStatus={
        hasVerifiedPhone && maskedPhone ? (
          <p className="mt-2 text-muted-foreground">
            Verified number: {maskedPhone}
          </p>
        ) : (
          <p className="mt-2 text-muted-foreground">{MFA_NO_BACKUP_NUMBER}</p>
        )
      }
    >
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

      {!smsConfigured ? (
        <p className="text-sm text-muted-foreground">
          Text/SMS delivery is not connected yet. You can still complete
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
                {MFA_PHONE_FIELD_HELPER}
              </p>
            )}
          </div>
          {hasVerifiedPhone ? (
            <div className="space-y-2">
              <Label htmlFor="mfa_current_password">Current password</Label>
              <Input
                id="mfa_current_password"
                name="current_password"
                type="password"
                autoComplete="current-password"
                aria-invalid={!!startState.fieldErrors?.current_password}
              />
              {startState.fieldErrors?.current_password ? (
                <p className="text-sm text-destructive">
                  {startState.fieldErrors.current_password}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Confirm your password to replace the verified backup number.
                </p>
              )}
            </div>
          ) : null}
          <Button type="submit" disabled={startPending || !smsConfigured}>
            {startPending
              ? "Sending..."
              : hasVerifiedPhone
                ? "Verify a new backup number"
                : MFA_SEND_VERIFICATION_LABEL}
          </Button>
        </form>
      )}

      {hasVerifiedPhone ? (
        <form action={removeAction} className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="mfa_remove_password">Current password</Label>
            <Input
              id="mfa_remove_password"
              name="current_password"
              type="password"
              autoComplete="current-password"
              aria-invalid={!!removeState.fieldErrors?.current_password}
            />
            {removeState.fieldErrors?.current_password ? (
              <p className="text-sm text-destructive">
                {removeState.fieldErrors.current_password}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Confirm your password to remove the backup number. Trusted
                devices will be revoked.
              </p>
            )}
          </div>
          <Button type="submit" variant="outline" disabled={removePending}>
            {removePending ? "Removing..." : "Remove backup phone"}
          </Button>
        </form>
      ) : null}
    </SignInVerificationCard>
  );
}
