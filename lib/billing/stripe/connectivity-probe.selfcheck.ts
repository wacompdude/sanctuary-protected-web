/**
 * Connectivity probe self-check. Does not call Stripe or the network.
 * Run: npx --yes tsx lib/billing/stripe/connectivity-probe.selfcheck.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Stripe from "stripe";
import {
  authorizeStripeConnectivityProbe,
  classifyStripeAccountIdentity,
  EXPECTED_STRIPE_ACCOUNT_ID,
  runStripeConnectivityProbeWithClient,
  sanitizeConnectivityProbeResult,
  type StripeConnectivityProbeResult,
} from "@/lib/billing/stripe/connectivity-probe";
import { extractSafeNetworkDiagnostics } from "@/lib/billing/stripe/safe-error-log";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const SECRET = "rk_test_51UGx3WRxaGtyRkAVSECRETVALUE";

function readRepo(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

async function main() {
  const enotfound = extractSafeNetworkDiagnostics({
    code: "ENOTFOUND",
    errno: "ENOTFOUND",
    syscall: "getaddrinfo",
    hostname: "api.stripe.com",
    raw: { Authorization: `Bearer ${SECRET}` },
  });
  assert(enotfound.networkCode === "ENOTFOUND", "networkCode");
  assert(enotfound.networkErrno === "ENOTFOUND", "networkErrno");
  assert(enotfound.networkSyscall === "getaddrinfo", "networkSyscall");
  assert(enotfound.networkHostname === "api.stripe.com", "allowed hostname");
  assert(!JSON.stringify(enotfound).includes(SECRET), "nested raw excluded");
  assert(!("raw" in enotfound), "no raw field");

  const refused = extractSafeNetworkDiagnostics({
    exception: {
      code: "ECONNREFUSED",
      errno: -111,
      syscall: "connect",
      hostname: "not-stripe.example",
    },
  });
  assert(refused.networkCode === "ECONNREFUSED", "exception code");
  assert(refused.networkErrno === -111, "exception errno");
  assert(refused.networkSyscall === "connect", "exception syscall");
  assert(refused.networkHostname === undefined, "other hostname rejected");

  assert(
    classifyStripeAccountIdentity({ accountId: EXPECTED_STRIPE_ACCOUNT_ID }) ===
      "MATCH",
    "direct match",
  );
  assert(
    classifyStripeAccountIdentity({ accountId: "acct_other" }) === "MISMATCH",
    "direct mismatch",
  );
  assert(
    classifyStripeAccountIdentity({
      errorMessage: `key '${SECRET}' on account '${EXPECTED_STRIPE_ACCOUNT_ID}'`,
    }) === "MATCH",
    "403 account match",
  );
  assert(
    classifyStripeAccountIdentity({
      errorMessage: "account 'acct_wrongaccount'",
    }) === "MISMATCH",
    "403 mismatch",
  );
  assert(
    classifyStripeAccountIdentity({ errorMessage: "no account here" }) ===
      "UNABLE_TO_VERIFY",
    "unable without id",
  );

  let stripeCalled = false;
  const denied = await authorizeStripeConnectivityProbe(async () => {
    throw new Error("forbidden");
  });
  if (denied.ok) stripeCalled = true;
  assert(!denied.ok, "non-admin rejected");
  assert(!stripeCalled, "probe not started after rejection");
  if (denied.ok) throw new Error("non-admin rejected");
  assert(!denied.error.includes(SECRET), "generic denial");

  const connection = new Stripe.errors.StripeConnectionError({
    message:
      "An error occurred with our connection to Stripe. Request was retried 2 times.",
  });
  Object.assign(connection, {
    detail: {
      exception: {
        code: "EAI_AGAIN",
        errno: "EAI_AGAIN",
        syscall: "getaddrinfo",
        hostname: "api.stripe.com",
        headers: { Authorization: SECRET },
      },
    },
  });

  const result = await runStripeConnectivityProbeWithClient(
    {
      prices: {
        async list() {
          throw connection;
        },
      },
      accounts: {
        async retrieveCurrent() {
          throw new Stripe.errors.StripePermissionError({
            message: `The provided key '${SECRET}' does not have the required permissions for this endpoint on account '${EXPECTED_STRIPE_ACCOUNT_ID}'.`,
            code: "more_permissions_required",
            statusCode: 403,
            requestId: "req_acct_1",
          });
        },
      },
    },
    async () => ({
      ok: false,
      httpStatus: null,
      durationMs: 12,
      networkCode: "ETIMEDOUT",
      networkErrno: "ETIMEDOUT",
      networkSyscall: "connect",
      networkHostname: "api.stripe.com",
    }),
    async () => {
      const error = new Stripe.errors.StripeConnectionError({
        message:
          "An error occurred with our connection to Stripe. Request was retried 2 times.",
      });
      Object.assign(error, {
        detail: {
          code: "ERR_INVALID_CHAR",
          message:
            'Invalid character in header content ["X-Stripe-Client-Telemetry"] Bearer ' +
            SECRET,
        },
      });
      throw error;
    },
  );

  assert(result.https.ok === false, "https fail");
  assert(result.https.networkCode === "ETIMEDOUT", "https code");
  assert(result.sdkRead.ok === false, "sdk fail");
  assert(result.sdkRead.httpResponseReceived === false, "no http response");
  assert(result.sdkRead.networkCode === "EAI_AGAIN", "sdk network code");
  assert(result.sdkRead.networkHostname === "api.stripe.com", "sdk hostname");
  assert(result.account.identity === "MATCH", "account match from 403");
  assert(result.account.httpStatus === 403, "account status");
  assert(result.account.code === "more_permissions_required", "account code");
  assert(result.catalog.ok === false, "catalog fail");
  assert(result.catalog.networkCode === "ERR_INVALID_CHAR", "catalog network code");
  assert(
    result.catalog.invalidHeaderName === "X-Stripe-Client-Telemetry",
    "catalog header name",
  );
  assert(result.catalog.httpResponseReceived === false, "catalog no http");
  const serialized = JSON.stringify(result);
  assert(!serialized.includes(SECRET), "probe result omits key");
  assert(!serialized.includes("Authorization"), "probe result omits header");
  assert(!serialized.includes("price_"), "probe result omits price ids");
  assert(!("message" in result.account), "account message not returned");

  const dirty = sanitizeConnectivityProbeResult({
    https: {
      ok: true,
      httpStatus: 401,
      durationMs: 5,
      networkCode: null,
      networkErrno: null,
      networkSyscall: null,
      secret: SECRET,
    },
    sdkRead: {
      ok: true,
      httpResponseReceived: true,
      httpStatus: 200,
      requestId: null,
      errorType: null,
      code: null,
      durationMs: 6,
      networkCode: null,
      networkErrno: null,
      networkSyscall: null,
      priceId: "price_secret",
    },
    account: {
      identity: "MATCH",
      httpStatus: 200,
      errorType: null,
      code: null,
      durationMs: 7,
      message: SECRET,
    },
    catalog: {
      ok: false,
      httpResponseReceived: false,
      httpStatus: null,
      requestId: null,
      errorType: "StripeConnectionError",
      code: null,
      durationMs: 9,
      networkCode: "ERR_INVALID_CHAR",
      networkErrno: null,
      networkSyscall: null,
      invalidHeaderName: "Not A Header",
      nodeMessage: `Invalid character in header content ["Authorization"] ${SECRET}`,
      priceId: "price_secret",
    },
  } as StripeConnectivityProbeResult);
  const clean = JSON.stringify(dirty);
  assert(!clean.includes(SECRET), "sanitize strips secrets");
  assert(!clean.includes("price_secret"), "sanitize strips price id");
  assert(!clean.includes("message"), "sanitize strips message");
  assert(dirty.catalog.invalidHeaderName === "unavailable", "bad header name rejected");
  assert(!clean.includes("price_secret"), "catalog price id stripped");
  assert(!clean.includes("nodeMessage"), "node message field stripped");

  const probeSource = readRepo("lib/billing/stripe/connectivity-probe.ts");
  const actionSource = readRepo(
    "app/platform/(console)/system/health/actions.ts",
  );
  const combined = `${probeSource}\n${actionSource}`;
  for (const forbidden of [
    "customers.create",
    "checkout.sessions.create",
    "subscriptions.create",
    "prices.create",
    "paymentIntents",
    "invoices.create",
  ]) {
    assert(!combined.includes(forbidden), `no write method ${forbidden}`);
  }
  assert(probeSource.includes("prices.list"), "uses prices.list");
  assert(probeSource.includes("retrieveCurrent"), "uses account retrieve");
  assert(probeSource.includes("https.get"), "uses node https");
  assert(
    probeSource.includes("resolveStripePriceByInternalKey"),
    "uses checkout catalog resolver",
  );
  assert(
    probeSource.includes("createStripeCatalogPriceLister"),
    "uses checkout price lister",
  );
  const catalogFn = probeSource.slice(
    probeSource.indexOf("export async function runExactCheckoutCatalogResolution"),
    probeSource.indexOf("export async function runStripeConnectivityProbeWithClient"),
  );
  assert(!catalogFn.includes("timeout"), "catalog request has no timeout override");
  assert(
    !catalogFn.includes("maxNetworkRetries"),
    "catalog request has no retry override",
  );
  assert(!catalogFn.includes("supabase"), "catalog resolver does not touch supabase");
  const runFn = probeSource.slice(
    probeSource.indexOf(
      "export async function runStripeConnectivityProbeWithClient",
    ),
  );
  assert(
    runFn.indexOf("await httpsProbe()") < runFn.indexOf("stripe.prices.list") &&
      runFn.indexOf("stripe.prices.list") <
        runFn.indexOf("stripe.accounts.retrieveCurrent") &&
      runFn.indexOf("stripe.accounts.retrieveCurrent") <
        runFn.indexOf("await catalogProbe()"),
    "diagnostic order is A B C D",
  );
  assert(actionSource.includes("system.health.read"), "platform permission");
  assert(
    !probeSource.includes("customers.create") &&
      actionSource.includes("requirePlatformPermission"),
    "action authorizes before the probe",
  );

  console.log("stripe connectivity probe self-check passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
