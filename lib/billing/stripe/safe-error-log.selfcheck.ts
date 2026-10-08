/**
 * Safe Stripe error log self-check (no Stripe network).
 * Run: npx --yes tsx lib/billing/stripe/safe-error-log.selfcheck.ts
 */
import Stripe from "stripe";
import {
  BillingCheckoutPlanError,
  StripeCatalogMismatchError,
} from "@/lib/billing/errors";
import {
  extractSafeStripeErrorLog,
  isStripeSdkError,
  logStripeBillingError,
  redactStripeErrorMessage,
  withStripeBillingErrorLog,
} from "@/lib/billing/stripe/safe-error-log";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const SECRET = "rk_test_51UGx3WRxaGtyRkAVSECRETVALUE";
const WEBHOOK = "whsec_supersecretvalue";

async function main() {
  const connection = new Stripe.errors.StripeConnectionError({
    message:
      "An error occurred with our connection to Stripe. Request was retried 2 times.",
    requestId: "req_conn_1",
  });
  Object.assign(connection, {
    detail: { code: "ECONNRESET", Authorization: `Bearer ${SECRET}` },
    headers: { Authorization: `Bearer ${SECRET}` },
    raw: { secret: SECRET },
  });

  assert(isStripeSdkError(connection), "connection error is stripe sdk");
  const connectionLog = extractSafeStripeErrorLog(
    "catalog_price_resolution",
    connection,
  );
  assert(connectionLog.operation === "catalog_price_resolution", "catalog op");
  assert(connectionLog.errorType === "StripeConnectionError", "connection type");
  assert(connectionLog.connectionError === true, "connection flag");
  assert(connectionLog.retries === 2, "retry count");
  assert(connectionLog.requestId === "req_conn_1", "request id");
  assert(connectionLog.statusCode === null, "no status on connection");
  assert(!("detail" in connectionLog), "no detail field");
  assert(!("headers" in connectionLog), "no headers field");
  assert(!("raw" in connectionLog), "no raw field");

  const permission = new Stripe.errors.StripePermissionError({
    message: `The provided key '${SECRET}' does not have permissions. Contact billing@example.test. ${WEBHOOK}`,
    code: "more_permissions_required",
    statusCode: 403,
    requestId: "req_perm_1",
    payment_method: { id: "pm_test" } as Stripe.PaymentMethod,
  });
  const permissionLog = extractSafeStripeErrorLog("customer_ensure", permission);
  assert(permissionLog.operation === "customer_ensure", "customer op");
  assert(permissionLog.errorType === "StripePermissionError", "permission type");
  assert(permissionLog.code === "more_permissions_required", "code");
  assert(permissionLog.statusCode === 403, "status");
  assert(permissionLog.requestId === "req_perm_1", "perm request id");
  assert(permissionLog.connectionError === false, "not connection");
  assert(permissionLog.retries === null, "no retries");
  assert(!permissionLog.message.includes(SECRET), "secret redacted");
  assert(!permissionLog.message.includes(WEBHOOK), "webhook redacted");
  assert(!permissionLog.message.includes("billing@example.test"), "email redacted");
  assert(!permissionLog.message.includes("4242"), "card not copied");
  assert(!("payment_method" in permissionLog), "no payment method");

  const sessionError = new Stripe.errors.StripeInvalidRequestError({
    message: "No such price",
    code: "resource_missing",
    statusCode: 400,
    requestId: "req_cs_1",
  });
  const sessionLog = extractSafeStripeErrorLog(
    "checkout_session_create",
    sessionError,
  );
  assert(sessionLog.operation === "checkout_session_create", "session op");
  assert(sessionLog.code === "resource_missing", "session code");

  const redacted = redactStripeErrorMessage(`Bearer ${SECRET} ${WEBHOOK}`);
  assert(!redacted.includes(SECRET), "bearer secret redacted");
  assert(!redacted.includes(WEBHOOK), "webhook pattern redacted");

  const lines: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    lines.push(args.map((arg) => String(arg)).join(" "));
  };
  try {
    logStripeBillingError("catalog_price_resolution", connection);
    logStripeBillingError(
      "customer_ensure",
      new BillingCheckoutPlanError("not a stripe error"),
    );
    logStripeBillingError(
      "catalog_price_resolution",
      new StripeCatalogMismatchError(
        "servant_standard_monthly",
        "catalog mismatch is not an SDK error",
      ),
    );
    let thrown: unknown = null;
    try {
      await withStripeBillingErrorLog("checkout_session_create", async () => {
        throw sessionError;
      });
    } catch (error) {
      thrown = error;
    }
    assert(thrown === sessionError, "rethrown original error");
  } finally {
    console.error = original;
  }

  assert(lines.length === 2, "only stripe sdk errors logged");
  const joined = lines.join("\n");
  assert(
    !joined.includes("catalog mismatch is not an SDK error"),
    "app catalog error not logged",
  );
  assert(joined.includes("catalog_price_resolution"), "logged catalog");
  assert(joined.includes("checkout_session_create"), "logged session");
  assert(!joined.includes("customer_ensure"), "app error not logged");
  assert(!joined.includes(SECRET), "log omits secret");
  assert(!joined.includes("Authorization"), "log omits auth header");
  assert(!joined.includes("ECONNRESET"), "log omits connection detail");
  assert(!joined.includes("pm_test"), "log omits payment method id");
  assert(!joined.includes("payment_method"), "log omits payment object");
  assert(!joined.includes('"raw"'), "log omits raw");

  console.log("stripe safe-error-log self-check passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
