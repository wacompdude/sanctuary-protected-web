"use client";

import { useActionState, useState, useTransition } from "react";
import {
  startPlatformMfaEnrollmentAction,
  verifyPlatformMfaEnrollmentAction,
  type PlatformSetupActionState,
} from "@/app/platform/actions";

type MfaState = PlatformSetupActionState & {
  factorId?: string;
  qrCode?: string;
  secret?: string;
};

const initialState: MfaState = {};

export function PlatformMfaSetupForm() {
  const [enrollError, setEnrollError] = useState<string | null>(null);
  const [pendingEnroll, startEnroll] = useTransition();
  const [factor, setFactor] = useState<{
    factorId: string;
    qrCode: string;
    secret: string;
  } | null>(null);

  const [state, action, pendingVerify] = useActionState(
    verifyPlatformMfaEnrollmentAction,
    initialState,
  );

  const activeFactor =
    factor ??
    (state.factorId && state.qrCode && state.secret
      ? {
          factorId: state.factorId,
          qrCode: state.qrCode,
          secret: state.secret,
        }
      : null);

  return (
    <div className="max-w-lg space-y-5">
      {(enrollError || state.error) && (
        <p className="rounded border border-rose-800 bg-rose-950/40 px-3 py-2 text-sm text-rose-200">
          {enrollError || state.error}
        </p>
      )}

      {!activeFactor ? (
        <button
          type="button"
          disabled={pendingEnroll}
          onClick={() => {
            setEnrollError(null);
            startEnroll(async () => {
              const result = await startPlatformMfaEnrollmentAction();
              if (result.error || !result.factorId || !result.qrCode || !result.secret) {
                setEnrollError(result.error || "Unable to start MFA enrollment.");
                return;
              }
              setFactor({
                factorId: result.factorId,
                qrCode: result.qrCode,
                secret: result.secret,
              });
            });
          }}
          className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-amber-400 disabled:opacity-50"
        >
          {pendingEnroll ? "Starting…" : "Start authenticator enrollment"}
        </button>
      ) : (
        <form action={action} className="space-y-4">
          <input type="hidden" name="factor_id" value={activeFactor.factorId} />
          <input type="hidden" name="qr_code" value={activeFactor.qrCode} />
          <input type="hidden" name="secret" value={activeFactor.secret} />

          <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
            <p className="mb-3 text-sm text-slate-300">
              Scan this QR code in your authenticator app, then enter the 6-digit
              code.
            </p>
            {/* qr_code from Supabase is an SVG data URL / markup-safe image source */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={activeFactor.qrCode}
              alt="MFA QR code"
              className="mx-auto h-48 w-48 rounded bg-white p-2"
            />
            <p className="mt-3 break-all text-xs text-slate-500">
              Manual secret: {activeFactor.secret}
            </p>
          </div>

          <label className="block text-sm">
            <span className="mb-1 block text-slate-400">Verification code</span>
            <input
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
            />
          </label>

          <button
            type="submit"
            disabled={pendingVerify}
            className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-amber-400 disabled:opacity-50"
          >
            {pendingVerify ? "Verifying…" : "Verify and enter console"}
          </button>
        </form>
      )}
    </div>
  );
}
