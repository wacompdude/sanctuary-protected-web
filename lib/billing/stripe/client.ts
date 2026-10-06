/**
 * Lazy Stripe SDK client — server modules only.
 * Do not import from Client Components.
 */

import "server-only";

export {
  getStripeClient,
  resetStripeClientCacheForTests,
} from "@/lib/billing/stripe/sdk";
