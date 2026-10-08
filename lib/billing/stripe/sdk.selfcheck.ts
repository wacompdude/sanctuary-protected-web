/**
 * Stripe client cache self-check. No Stripe network.
 * Run: npx --yes tsx lib/billing/stripe/sdk.selfcheck.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type Stripe from "stripe";
import { BillingConfigurationError } from "@/lib/billing/errors";
import {
  getStripeClient,
  resetStripeClientCacheForTests,
} from "@/lib/billing/stripe/sdk";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function authenticatorKey(client: Stripe): string {
  const stored = (
    client as unknown as { _authenticator?: { _apiKey?: string } }
  )._authenticator?._apiKey;
  if (typeof stored !== "string" || !stored) {
    throw new Error("Stripe client is missing its in-memory authenticator key");
  }
  return stored;
}

function expectRejected(key: string) {
  resetStripeClientCacheForTests();
  let caught: unknown = null;
  try {
    getStripeClient(key);
  } catch (error) {
    caught = error;
  }
  assert(caught instanceof BillingConfigurationError, "invalid key rejected");
  if (!(caught instanceof BillingConfigurationError)) return;
  assert(
    caught.message === "Stripe secret key contains invalid characters.",
    "generic configuration error",
  );
  assert(!caught.message.includes(key), "error omits secret");
  assert(!/\b(length|hash|fingerprint|prefix|suffix)\b/i.test(caught.message), "error omits key metadata");
}

async function main() {
  const restrictedA = `rk_test_${"a".repeat(24)}`;
  const restrictedB = `rk_test_${"b".repeat(24)}`;
  const restrictedLonger = `${restrictedB}x`;
  const secretTest = `sk_test_${"c".repeat(24)}`;

  resetStripeClientCacheForTests();
  const first = getStripeClient(restrictedA);
  const again = getStripeClient(restrictedA);
  assert(first === again, "CASE A same key reuses client");
  assert(authenticatorKey(again) === restrictedA, "CASE A keeps the same key");

  resetStripeClientCacheForTests();
  const sameLengthLeft = getStripeClient(restrictedA);
  const sameLengthRight = getStripeClient(restrictedB);
  assert(sameLengthLeft !== sameLengthRight, "CASE B same length not reused");
  assert(authenticatorKey(sameLengthRight) === restrictedB, "CASE B uses the new key");

  resetStripeClientCacheForTests();
  const shortClient = getStripeClient(restrictedB);
  const longClient = getStripeClient(restrictedLonger);
  assert(shortClient !== longClient, "CASE C different length not reused");
  assert(authenticatorKey(longClient) === restrictedLonger, "CASE C uses longer key");

  resetStripeClientCacheForTests();
  const restrictedClient = getStripeClient(restrictedA);
  const standardClient = getStripeClient(secretTest);
  assert(restrictedA.length === secretTest.length, "CASE D keys share length");
  assert(restrictedClient !== standardClient, "CASE D restricted vs secret not reused");
  assert(authenticatorKey(standardClient) === secretTest, "CASE D uses secret test key");

  resetStripeClientCacheForTests();
  const warmFirst = getStripeClient(restrictedA);
  const warmSecond = getStripeClient(restrictedB);
  const warmSecondAgain = getStripeClient(restrictedB);
  assert(warmFirst !== warmSecond, "CASE E rotation replaces client");
  assert(warmSecond === warmSecondAgain, "CASE E new key is cached");
  assert(authenticatorKey(warmSecondAgain) === restrictedB, "CASE E client uses new value");
  const rotatedBack = getStripeClient(restrictedA);
  assert(rotatedBack !== warmFirst, "CASE E returning to the old key builds a new client");
  assert(authenticatorKey(rotatedBack) === restrictedA, "CASE E restored key is exact");

  for (const bad of [
    `rk_test_${"a".repeat(8)}\r${"b".repeat(8)}`,
    `rk_test_${"a".repeat(8)}\n${"b".repeat(8)}`,
    `rk_test_${"a".repeat(8)}\0${"b".repeat(8)}`,
    `rk_test_${"a".repeat(8)}\u007f${"b".repeat(8)}`,
  ]) {
    expectRejected(bad);
  }
  const goodAfterReject = getStripeClient(restrictedA);
  assert(authenticatorKey(goodAfterReject) === restrictedA, "CASE F does not cache the rejected key");

  resetStripeClientCacheForTests();
  const padded = ` \t${restrictedA}\r\n`;
  const fromPadded = getStripeClient(padded);
  const fromTrimmed = getStripeClient(restrictedA);
  assert(fromPadded === fromTrimmed, "CASE G trimmed key reuses client");
  assert(authenticatorKey(fromTrimmed) === restrictedA, "CASE G stores the trimmed key");

  resetStripeClientCacheForTests();
  const restrictedOk = getStripeClient(restrictedA);
  assert(authenticatorKey(restrictedOk) === restrictedA, "CASE H restricted test key accepted");

  const sdkSource = readFileSync(
    join(process.cwd(), "lib/billing/stripe/sdk.ts"),
    "utf8",
  );
  const clientSource = readFileSync(
    join(process.cwd(), "lib/billing/stripe/client.ts"),
    "utf8",
  );
  assert(!sdkSource.includes("cachedKeyFingerprint"), "old length cache removed");
  assert(!sdkSource.includes("keyFingerprint"), "old fingerprint helper removed");
  assert(sdkSource.includes("cachedSecretKey === key"), "exact equality cache");
  assert(!sdkSource.includes("export let cachedSecretKey"), "secret is not exported");
  assert(!sdkSource.includes("export { cachedSecretKey"), "secret is not re-exported");
  assert(!sdkSource.includes("console."), "sdk does not log");
  assert(
    sdkSource.indexOf("assertStripeSecretHeaderSafe") <
      sdkSource.indexOf("new Stripe"),
    "validation runs before Stripe construction",
  );
  assert(clientSource.includes('import "server-only"'), "browser entry is server-only");

  resetStripeClientCacheForTests();
  console.log("stripe sdk cache self-check passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
