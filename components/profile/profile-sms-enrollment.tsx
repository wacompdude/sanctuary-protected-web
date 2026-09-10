"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
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
import {
  optOutSmsAction,
  startSmsEnrollmentAction,
  verifySmsEnrollmentAction,
} from "@/app/(app)/profile/sms-actions";
import { SmsConsentDisclosure } from "@/components/sms/sms-consent-disclosure";
import type { SmsEnrollmentState } from "@/lib/sms/consent";
import { formatNanpDisplay, maskMobileE164 } from "@/lib/sms/phone";
import { PRODUCT_NAME } from "@/lib/legal/config";

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

  return (
    <Card>
      <CardHeader>
        <h2 className="text-xl font-semibold leading-none tracking-tight">
          SMS Messaging
        </h2>
        <CardDescription>
          Separate from your mobile number and from two-factor authentication.
          {PRODUCT_NAME} only sends application texts after you opt in here.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-sm font-medium">Status</p>
          <p className="text-sm text-muted-foreground">
            {enrollmentState === "OPTED_IN"
              ? "Enabled"
              : enrollmentState === "OPTED_OUT"
                ? "Opted Out"
                : enrollmentState === "PENDING_VERIFICATION" || pending
                  ? "Pending verification"
                  : "Not Enrolled"}
          </p>
        </div>

        {enrollmentState === "OPTED_IN" && verifiedNumber ? (
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
              <Button
                type="submit"
                variant="outline"
                disabled={optOutPending}
              >
                {optOutPending ? "Opting out…" : "Opt Out of SMS Messaging"}
              </Button>
            </form>
          </div>
        ) : null}

        {destinationError ? (
          <p className="text-sm text-destructive">{destinationError}</p>
        ) : null}

        {!phone ? (
          <p className="text-sm text-muted-foreground">
            Save a mobile phone number above, then enable SMS messaging. Saving
            a number does not enroll you in texts.
          </p>
        ) : enrollmentState !== "OPTED_IN" ? (
          <>
            {pending ? (
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

            <form action={enrollAction} className="space-y-3">
              <input type="hidden" name="phone" value={phone} />
              {enrollState.error ? (
                <p className="text-sm text-destructive">{enrollState.error}</p>
              ) : null}

              <SmsConsentDisclosure agreed={agreed} onAgreedChange={setAgreed} />

              <Button type="submit" disabled={!agreed || enrollPending}>
                {enrollPending
                  ? "Starting…"
                  : enrollmentState === "OPTED_OUT"
                    ? "Re-Enroll in SMS Messaging"
                    : "Verify Number & Enable SMS"}
              </Button>
            </form>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
