/**
 * Shared lazy Stripe SDK factory (no server-only).
 * Prefer importing getStripeClient from client.ts in Next.js server modules.
 * CLI scripts may use this module directly because server-only throws under tsx.
 *
 * The cached secret stays in module memory so the Stripe client can
 * authenticate. It is not exported, logged, hashed, or persisted.
 */

import Stripe from "stripe";
import { BillingConfigurationError } from "@/lib/billing/errors";
import { requireStripeSecretKey } from "@/lib/billing/stripe/config";

let cachedClient: Stripe | null = null;
let cachedSecretKey: string | null = null;

/**
 * Characters Node rejects in an HTTP header value.
 * Tab and printable bytes are left to Stripe; this does not alter the key.
 */
const ILLEGAL_AUTHORIZATION_CHAR = /[^\t\x20-\x7e\x80-\xff]/;

function assertStripeSecretHeaderSafe(secretKey: string): void {
  if (ILLEGAL_AUTHORIZATION_CHAR.test(secretKey)) {
    throw new BillingConfigurationError(
      "Stripe secret key contains invalid characters.",
    );
  }
}

/**
 * Lazy Stripe SDK client. Does not instantiate at module import time.
 * Requires a non-empty STRIPE_SECRET_KEY when called.
 * Reuses the cached client only when the normalized secret is exactly equal.
 */
export function getStripeClient(
  secretKey: string | null | undefined = undefined,
): Stripe {
  const key = requireStripeSecretKey(secretKey);
  assertStripeSecretHeaderSafe(key);
  if (cachedClient && cachedSecretKey === key) {
    return cachedClient;
  }

  cachedClient = new Stripe(key);
  cachedSecretKey = key;
  return cachedClient;
}

/** Test helper — clears lazy client cache between self-check cases. */
export function resetStripeClientCacheForTests(): void {
  cachedClient = null;
  cachedSecretKey = null;
}
