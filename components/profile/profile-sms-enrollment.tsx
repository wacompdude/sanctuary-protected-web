"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  optOutSmsAction,
  startSmsEnrollmentAction,
  verifySmsEnrollmentAction,
} from "@/app/(app)/profile/sms-actions";
import { SmsConsentDisclosure } from "@/components/sms/sms-consent-disclosure";
import { SmsMessagingCard } from "@/components/sms/sms-messaging-card";
import { SMS_ENABLE_BUTTON_LABEL } from "@/lib/sms/consent-copy";
import type { SmsEnrollmentState } from "@/lib/sms/consent";
import {
  inspectMobileNumber,
  formatNanpDisplay,
  maskMobileE164,
} from "@/lib/sms/phone";

function formatConsentDate(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

function statusLabel(
  enrollmentState: SmsEnrollmentState,
  pending: boolean,
): string {
  if (enrollmentState === "OPTED_IN") return "Enabled";
  if (enrollmentState === "OPTED_OUT") return "Opted Out";
  if (enrollmentState === "PENDING_VERIFICATION" || pending) {
    return "Pending verification";
  }
  return "Not Enrolled";
}

export function ProfileSmsEnrollment({
  phone,
  enrollmentState,
  verifiedNumber,
  consentedAt,
  destinationError,
}: {
  phone: string | null;
  enrollmentState: SmsEnrollmentState;
  verifiedNumber: string | null;
  consentedAt: string | null;
  destinationError?: string | null;
}) {
  const [agreed, setAgreed] = useState(false);
  const [enrollState, enrollAction, enrollPending] = useActionState(
    startSmsEnrollmentAction,
    {},
  );
  const [verifyState, verifyAction, verifyPending] = useActionState(
    verifySmsEnrollmentAction,
    {},
  );
  const [optOutState, optOutAction, optOutPending] = useActionState(
    optOutSmsAction,
    {},
  );

  const displayPhone = phone ? formatNanpDisplay(phone) : null;
  const pending =
    enrollmentState === "PENDING_VERIFICATION" || enrollState.success;
  const phoneValid = Boolean(phone && inspectMobileNumber(phone).supported);
  const optedIn = enrollmentState === "OPTED_IN";

  return (
    <SmsMessagingCard
      statusLabel={statusLabel(enrollmentState, pending)}
      showHelper={!optedIn}
    >
      {optedIn && verifiedNumber ? (
        <div className="space-y-1 text-sm">
          <p>
            Verified number:{" "}
            <span className="font-medium">{maskMobileE164(verifiedNumber)}</span>
          </p>
          {consentedAt ? (
            <p className="text-muted-foreground">
              Consent captured: {formatConsentDate(consentedAt)}
            </p>
          ) : null}
          <p>
            <Link
              href="/notifications/preferences"
              className="underline underline-offset-4"
            >
              Manage SMS Preferences
            </Link>
          </p>
          <form
            action={optOutAction}
            onSubmit={(event) => {
              if (
                !window.confirm(
                  "Opt out of SMS messaging? Your mobile number will be kept unless you remove it separately.",
                )
              ) {
                event.preventDefault();
              }
            }}
          >
            {optOutState.error ? (
              <p className="mb-2 text-sm text-destructive">{optOutState.error}</p>
            ) : null}
            <Button type="submit" variant="outline" disabled={optOutPending}>
              {optOutPending ? "Opting out…" : "Opt Out of SMS Messaging"}
            </Button>
          </form>
        </div>
      ) : null}

      {destinationError ? (
        <p className="text-sm text-destructive">{destinationError}</p>
      ) : null}

      {!optedIn && pending ? (
        <form action={verifyAction} className="space-y-3">
          {verifyState.error ? (
            <p className="text-sm text-destructive">{verifyState.error}</p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Enter the verification code sent to {displayPhone}.
            </p>
          )}
          <div className="space-y-2">
            <Label htmlFor="sms_code">Verification code</Label>
            <Input
              id="sms_code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              aria-invalid={!!verifyState.fieldErrors?.code}
            />
          </div>
          <Button type="submit" disabled={verifyPending}>
            {verifyPending ? "Verifying…" : "Verify number"}
          </Button>
        </form>
      ) : null}

      {!optedIn ? (
        <form action={enrollAction} className="space-y-4">
          <input type="hidden" name="phone" value={phone ?? ""} />
          {enrollState.error ? (
            <p className="text-sm text-destructive">{enrollState.error}</p>
          ) : null}
          <SmsConsentDisclosure agreed={agreed} onAgreedChange={setAgreed} />
          <Button
            type="submit"
            disabled={!agreed || !phoneValid || enrollPending}
          >
            {enrollPending ? "Starting…" : SMS_ENABLE_BUTTON_LABEL}
          </Button>
        </form>
      ) : null}
    </SmsMessagingCard>
  );
}
