/**
 * Shared lazy Stripe SDK factory (no server-only).
 * Prefer importing getStripeClient from client.ts in Next.js server modules.
 * CLI scripts may use this module directly because server-only throws under tsx.
 */

import Stripe from "stripe";
import {
  classifyStripeSecretMode,
  requireStripeSecretKey,
} from "@/lib/billing/stripe/config";

let cachedClient: Stripe | null = null;
let cachedKeyFingerprint: string | null = null;

function keyFingerprint(secretKey: string): string {
  const mode = classifyStripeSecretMode(secretKey);
  return `${mode}:${secretKey.length}`;
}

/**
 * Lazy Stripe SDK client. Does not instantiate at module import time.
 * Requires a non-empty STRIPE_SECRET_KEY when called.
 */
export function getStripeClient(
  secretKey: string | null | undefined = undefined,
): Stripe {
  const key = requireStripeSecretKey(secretKey);
  const fingerprint = keyFingerprint(key);
  if (cachedClient && cachedKeyFingerprint === fingerprint) {
    return cachedClient;
  }

  cachedClient = new Stripe(key);
  cachedKeyFingerprint = fingerprint;
  return cachedClient;
}

/** Test helper — clears lazy client cache between self-check cases. */
export function resetStripeClientCacheForTests(): void {
  cachedClient = null;
  cachedKeyFingerprint = null;
}
