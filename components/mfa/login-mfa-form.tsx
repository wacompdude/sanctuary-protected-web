"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { OtpCodeInput } from "@/components/mfa/otp-code-input";
import { SignOutFormButton } from "@/components/sign-out-form-button";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  startLoginEmailMfaAction,
  startLoginSmsMfaAction,
  verifyLoginMfaAction,
} from "@/app/auth/mfa/actions";
import type { LoginMfaView, MfaActionState } from "@/lib/mfa/types";

type Step = "email_code" | "sms_confirm" | "sms_code";

const initialState: MfaActionState = {};

export function LoginMfaForm({
  nextPath,
  initialView,
}: {
  nextPath: string;
  initialView: LoginMfaView;
}) {
  const [step, setStep] = useState<Step>("email_code");
  const [view, setView] = useState<LoginMfaView>(initialView);
  const [startError, setStartError] = useState<string | null>(null);
  const [pendingStart, startTransition] = useTransition();
  const startedRef = useRefOnce();

  const [state, verifyAction, pendingVerify] = useActionState(
    verifyLoginMfaAction,
    initialState,
  );

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    startTransition(async () => {
      const result = await startLoginEmailMfaAction();
      if (result.error) setStartError(result.error);
      if (result.view) setView(result.view);
    });
  }, [startedRef]);

  useEffect(() => {
    if (!state.verified) return;
    const timer = window.setTimeout(() => {
      window.location.assign(nextPath);
    }, 700);
    return () => window.clearTimeout(timer);
  }, [state.verified, nextPath]);

  const error = state.error ?? startError;
  const channel = step === "sms_code" ? "sms" : "email";
  const masked =
    step === "sms_code" || step === "sms_confirm"
      ? view.smsBackupMaskedPhone ?? view.maskedDestination
      : view.maskedDestination;

  async function resendEmail() {
    setStartError(null);
    startTransition(async () => {
      const result = await startLoginEmailMfaAction();
      if (result.error) setStartError(result.error);
      if (result.view) setView(result.view);
      setStep("email_code");
    });
  }

  async function sendSms() {
    setStartError(null);
    startTransition(async () => {
      const result = await startLoginSmsMfaAction();
      if (result.error) {
        setStartError(result.error);
        return;
      }
      if (result.view) setView(result.view);
      setStep("sms_code");
    });
  }

  return (
    <Card>
      <CardHeader className="space-y-3 text-center">
        <BrandLogo
          href="/"
          size={40}
          className="mx-auto justify-center"
          wordmarkClassName="text-2xl font-semibold"
        />
        <CardTitle className="text-xl">
          {state.verified ? "MFA verified" : "Verify your identity"}
        </CardTitle>
        <CardDescription>
          {state.verified
            ? "You are signed in. Continuing…"
            : step === "sms_confirm"
              ? "Send a verification code by text message."
              : step === "sms_code"
                ? "Enter the 6-digit code sent to:"
                : "We've sent a 6-digit verification code to:"}
        </CardDescription>
        {state.verified ? null : (
          <p className="text-sm font-medium text-foreground">{masked}</p>
        )}
      </CardHeader>
      <CardContent className="space-y-5">
        {error && !state.verified ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        {view.devCode ? (
          <p className="rounded-md border border-amber-700/30 bg-amber-50/70 px-3 py-2 text-xs text-muted-foreground dark:bg-amber-950/20">
            Development delivery: {view.devCode}
          </p>
        ) : null}

        {state.verified ? (
          <p className="text-center text-sm text-muted-foreground">
            Access granted.
          </p>
        ) : step === "sms_confirm" ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Send verification code to:
            </p>
            <p className="text-center text-sm font-medium">
              {view.smsBackupMaskedPhone}
            </p>
            <Button
              type="button"
              className="w-full"
              disabled={pendingStart}
              onClick={() => void sendSms()}
            >
              {pendingStart ? "Sending..." : "Send code"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => {
                setStartError(null);
                setStep("email_code");
              }}
            >
              Use email instead
            </Button>
          </div>
        ) : (
          <form action={verifyAction} className="space-y-4">
            <input type="hidden" name="channel" value={channel} />
            <input type="hidden" name="next" value={nextPath} />
            <OtpCodeInput
              disabled={pendingVerify || pendingStart}
              error={!!state.fieldErrors?.code}
            />
            <Button
              type="submit"
              className="w-full"
              disabled={pendingVerify || pendingStart}
            >
              {pendingVerify ? "Verifying..." : "Verify"}
            </Button>
          </form>
        )}

        {state.verified ? null : step !== "sms_confirm" ? (
          <div className="space-y-2 text-center text-sm">
            <p className="text-muted-foreground">Didn't receive the code?</p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pendingStart || view.retryAfterSeconds > 0}
              onClick={() => {
                if (step === "sms_code") {
                  void sendSms();
                  return;
                }
                void resendEmail();
              }}
            >
              {pendingStart
                ? "Sending..."
                : view.retryAfterSeconds > 0
                  ? `Resend code (${view.retryAfterSeconds}s)`
                  : "Resend code"}
            </Button>
            {step === "email_code" && view.smsBackupAvailable ? (
              <div>
                <p className="text-muted-foreground">Can't access your email?</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setStartError(null);
                    setStep("sms_confirm");
                  }}
                >
                  Send code by text message
                </Button>
              </div>
            ) : null}
            {step === "sms_code" ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setStartError(null);
                  setStep("email_code");
                  void resendEmail();
                }}
              >
                Use email instead
              </Button>
            ) : null}
          </div>
        ) : null}

        <div className="pt-2 text-center">
          <SignOutFormButton variant="outline" size="sm">
            Use a different account
          </SignOutFormButton>
        </div>
      </CardContent>
    </Card>
  );
}

function useRefOnce() {
  const [ref] = useState({ current: false });
  return ref;
}
