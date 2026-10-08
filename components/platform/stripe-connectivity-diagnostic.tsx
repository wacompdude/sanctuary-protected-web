"use client";

import { useActionState } from "react";
import {
  runStripeConnectivityDiagnosticAction,
  type StripeConnectivityActionState,
} from "@/app/platform/(console)/system/health/actions";
import type { SafeNetworkDiagnostics } from "@/lib/billing/stripe/safe-error-log";

function networkLines(network: SafeNetworkDiagnostics): string[] {
  const lines = [
    `networkCode: ${network.networkCode ?? "—"}`,
    `networkErrno: ${network.networkErrno ?? "—"}`,
    `networkSyscall: ${network.networkSyscall ?? "—"}`,
  ];
  if (network.networkHostname) {
    lines.push(`networkHostname: ${network.networkHostname}`);
  }
  return lines;
}

export function StripeConnectivityDiagnostic() {
  const [state, action, pending] = useActionState(
    runStripeConnectivityDiagnosticAction,
    null as StripeConnectivityActionState,
  );

  return (
    <section className="space-y-3 rounded-lg border border-slate-800 p-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">
          Stripe Connectivity Diagnostic
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          Temporary read-only checks. This does not create Stripe customers,
          Checkout sessions, subscriptions, prices, or payments.
        </p>
      </div>
      <form action={action}>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-sky-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? "Running…" : "Run read-only diagnostic"}
        </button>
      </form>
      {state && !state.ok ? (
        <p className="text-sm text-rose-300">{state.error}</p>
      ) : null}
      {state?.ok ? (
        <div className="space-y-3 text-sm text-slate-300">
          <div>
            <p className="font-medium text-slate-100">
              HTTPS/DNS/TLS: {state.result.https.ok ? "PASS" : "FAIL"}
            </p>
            <p>HTTP status: {state.result.https.httpStatus ?? "—"}</p>
            <p>Duration: {state.result.https.durationMs} ms</p>
            {networkLines(state.result.https).map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
          <div>
            <p className="font-medium text-slate-100">
              Stripe SDK read: {state.result.sdkRead.ok ? "PASS" : "FAIL"}
            </p>
            <p>
              HTTP response received:{" "}
              {state.result.sdkRead.httpResponseReceived ? "yes" : "no"}
            </p>
            <p>HTTP status: {state.result.sdkRead.httpStatus ?? "—"}</p>
            <p>Request ID: {state.result.sdkRead.requestId ?? "—"}</p>
            <p>Error type: {state.result.sdkRead.errorType ?? "—"}</p>
            <p>Error code: {state.result.sdkRead.code ?? "—"}</p>
            <p>Duration: {state.result.sdkRead.durationMs} ms</p>
            {networkLines(state.result.sdkRead).map((line) => (
              <p key={`sdk-${line}`}>{line}</p>
            ))}
          </div>
          <div>
            <p className="font-medium text-slate-100">
              Account identity: {state.result.account.identity}
            </p>
            <p>HTTP status: {state.result.account.httpStatus ?? "—"}</p>
            <p>Error type: {state.result.account.errorType ?? "—"}</p>
            <p>Error code: {state.result.account.code ?? "—"}</p>
            <p>Duration: {state.result.account.durationMs} ms</p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
