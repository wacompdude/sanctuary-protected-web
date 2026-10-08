/**
 * Temporary read-only Stripe connectivity probe.
 * No Customer, Checkout, subscription, or price writes.
 */

import https from "node:https";
import { getStripeClient } from "@/lib/billing/stripe/sdk";
import {
  extractSafeNetworkDiagnostics,
  extractSafeStripeErrorLog,
  STRIPE_API_HOSTNAME,
  type SafeNetworkDiagnostics,
} from "@/lib/billing/stripe/safe-error-log";

export const EXPECTED_STRIPE_ACCOUNT_ID = "acct_1UGx3WRxaGtyRkAV";
export const CONNECTIVITY_PROBE_TIMEOUT_MS = 8000;

export type AccountIdentity = "MATCH" | "MISMATCH" | "UNABLE_TO_VERIFY";

export type HttpsConnectivityResult = SafeNetworkDiagnostics & {
  ok: boolean;
  httpStatus: number | null;
  durationMs: number;
};

export type SdkReadConnectivityResult = SafeNetworkDiagnostics & {
  ok: boolean;
  httpResponseReceived: boolean;
  httpStatus: number | null;
  requestId: string | null;
  errorType: string | null;
  code: string | null;
  durationMs: number;
};

export type AccountIdentityResult = {
  identity: AccountIdentity;
  httpStatus: number | null;
  errorType: string | null;
  code: string | null;
  durationMs: number;
};

export type StripeConnectivityProbeResult = {
  https: HttpsConnectivityResult;
  sdkRead: SdkReadConnectivityResult;
  account: AccountIdentityResult;
};

const ACCOUNT_ID_PATTERN = /acct_[A-Za-z0-9]+/g;

export function classifyStripeAccountIdentity(input: {
  accountId?: string | null;
  errorMessage?: string | null;
  expectedAccountId?: string;
}): AccountIdentity {
  const expected = input.expectedAccountId ?? EXPECTED_STRIPE_ACCOUNT_ID;
  const direct = input.accountId?.trim() ?? "";
  if (direct) {
    return direct === expected ? "MATCH" : "MISMATCH";
  }
  const found = new Set(input.errorMessage?.match(ACCOUNT_ID_PATTERN) ?? []);
  if (found.size !== 1) return "UNABLE_TO_VERIFY";
  return found.has(expected) ? "MATCH" : "MISMATCH";
}

function emptyNetwork(): SafeNetworkDiagnostics {
  return { networkCode: null, networkErrno: null, networkSyscall: null };
}

/** Drop any extra fields before display or logging. */
export function sanitizeConnectivityProbeResult(
  input: StripeConnectivityProbeResult,
): StripeConnectivityProbeResult {
  const httpsNetwork = extractSafeNetworkDiagnostics({
    code: input.https.networkCode,
    errno: input.https.networkErrno,
    syscall: input.https.networkSyscall,
    hostname: input.https.networkHostname,
  });
  const sdkNetwork = extractSafeNetworkDiagnostics({
    code: input.sdkRead.networkCode,
    errno: input.sdkRead.networkErrno,
    syscall: input.sdkRead.networkSyscall,
    hostname: input.sdkRead.networkHostname,
  });
  return {
    https: {
      ok: Boolean(input.https.ok),
      httpStatus:
        typeof input.https.httpStatus === "number" ? input.https.httpStatus : null,
      durationMs: Math.max(0, Math.round(input.https.durationMs || 0)),
      ...httpsNetwork,
    },
    sdkRead: {
      ok: Boolean(input.sdkRead.ok),
      httpResponseReceived: Boolean(input.sdkRead.httpResponseReceived),
      httpStatus:
        typeof input.sdkRead.httpStatus === "number"
          ? input.sdkRead.httpStatus
          : null,
      requestId:
        typeof input.sdkRead.requestId === "string" ? input.sdkRead.requestId : null,
      errorType:
        typeof input.sdkRead.errorType === "string" ? input.sdkRead.errorType : null,
      code: typeof input.sdkRead.code === "string" ? input.sdkRead.code : null,
      durationMs: Math.max(0, Math.round(input.sdkRead.durationMs || 0)),
      ...sdkNetwork,
    },
    account: {
      identity:
        input.account.identity === "MATCH" || input.account.identity === "MISMATCH"
          ? input.account.identity
          : "UNABLE_TO_VERIFY",
      httpStatus:
        typeof input.account.httpStatus === "number"
          ? input.account.httpStatus
          : null,
      errorType:
        typeof input.account.errorType === "string" ? input.account.errorType : null,
      code: typeof input.account.code === "string" ? input.account.code : null,
      durationMs: Math.max(0, Math.round(input.account.durationMs || 0)),
    },
  };
}

export async function authorizeStripeConnectivityProbe(
  authorize: () => Promise<void>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await authorize();
    return { ok: true };
  } catch {
    return {
      ok: false,
      error: "You do not have permission to run this diagnostic.",
    };
  }
}

export function probeStripeHttps(
  timeoutMs = CONNECTIVITY_PROBE_TIMEOUT_MS,
): Promise<HttpsConnectivityResult> {
  const started = Date.now();
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: HttpsConnectivityResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    const req = https.get(
      `https://${STRIPE_API_HOSTNAME}`,
      { timeout: timeoutMs, servername: STRIPE_API_HOSTNAME },
      (response) => {
        response.resume();
        finish({
          ok: true,
          httpStatus: response.statusCode ?? null,
          durationMs: Date.now() - started,
          ...emptyNetwork(),
        });
      },
    );
    const fail = (error: unknown) => {
      finish({
        ok: false,
        httpStatus: null,
        durationMs: Date.now() - started,
        ...extractSafeNetworkDiagnostics(error),
      });
    };
    req.setTimeout(timeoutMs, () => {
      req.destroy(Object.assign(new Error("timeout"), { code: "ETIMEDOUT", syscall: "connect", hostname: STRIPE_API_HOSTNAME }));
    });
    req.on("error", fail);
  });
}

type StripeReadClient = {
  prices: {
    list: (
      params: { limit: number },
      options: { timeout: number; maxNetworkRetries: number },
    ) => Promise<unknown>;
  };
  accounts: {
    retrieveCurrent: (
      params: Record<string, never> | undefined,
      options: { timeout: number; maxNetworkRetries: number },
    ) => Promise<{ id?: string }>;
  };
};

const readOptions = {
  timeout: CONNECTIVITY_PROBE_TIMEOUT_MS,
  maxNetworkRetries: 0,
};

function sdkFailure(error: unknown, started: number): SdkReadConnectivityResult {
  const safe = extractSafeStripeErrorLog("catalog_price_resolution", error);
  return {
    ok: false,
    httpResponseReceived: safe.statusCode != null || safe.requestId != null,
    httpStatus: safe.statusCode,
    requestId: safe.requestId,
    errorType: safe.errorType,
    code: safe.code,
    durationMs: Date.now() - started,
    networkCode: safe.networkCode,
    networkErrno: safe.networkErrno,
    networkSyscall: safe.networkSyscall,
    ...(safe.networkHostname ? { networkHostname: safe.networkHostname } : {}),
  };
}

export async function runStripeConnectivityProbeWithClient(
  stripe: StripeReadClient,
  httpsProbe: () => Promise<HttpsConnectivityResult> = probeStripeHttps,
): Promise<StripeConnectivityProbeResult> {
  const httpsResult = await httpsProbe();

  const sdkStarted = Date.now();
  let sdkRead: SdkReadConnectivityResult;
  try {
    await stripe.prices.list({ limit: 1 }, readOptions);
    sdkRead = {
      ok: true,
      httpResponseReceived: true,
      httpStatus: 200,
      requestId: null,
      errorType: null,
      code: null,
      durationMs: Date.now() - sdkStarted,
      ...emptyNetwork(),
    };
  } catch (error) {
    sdkRead = sdkFailure(error, sdkStarted);
  }

  const accountStarted = Date.now();
  let account: AccountIdentityResult;
  try {
    const retrieved = await stripe.accounts.retrieveCurrent(undefined, readOptions);
    account = {
      identity: classifyStripeAccountIdentity({ accountId: retrieved.id ?? null }),
      httpStatus: 200,
      errorType: null,
      code: null,
      durationMs: Date.now() - accountStarted,
    };
  } catch (error) {
    const safe = extractSafeStripeErrorLog("catalog_price_resolution", error);
    const message = error instanceof Error ? error.message : "";
    account = {
      identity: classifyStripeAccountIdentity({ errorMessage: message }),
      httpStatus: safe.statusCode,
      errorType: safe.errorType,
      code: safe.code,
      durationMs: Date.now() - accountStarted,
    };
  }

  return sanitizeConnectivityProbeResult({
    https: httpsResult,
    sdkRead,
    account,
  });
}

export async function runStripeConnectivityProbe(): Promise<StripeConnectivityProbeResult> {
  const stripe = getStripeClient();
  return runStripeConnectivityProbeWithClient(stripe);
}
