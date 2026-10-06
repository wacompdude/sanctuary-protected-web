import { getStripeClient } from "@/lib/billing/stripe/sdk";
import type {
  ListPricesByLookupKey,
  StripePriceSnapshot,
} from "@/lib/billing/stripe/catalog";

/**
 * Live Stripe Price listing for catalog resolution (Phase 4B-2).
 * READ-ONLY prices.list only. Never create/update Prices or Products.
 *
 * Uses sdk.ts (not client.ts) so CLI validation under tsx does not hit server-only.
 * Next.js app code should still import getStripeClient from client.ts.
 */
function toPriceSnapshot(price: {
  id: string;
  active: boolean;
  currency: string;
  unit_amount: number | null;
  type: string;
  lookup_key: string | null;
  recurring: { interval: string } | null;
  product: string | { id: string } | null;
}): StripePriceSnapshot {
  const productId =
    typeof price.product === "string"
      ? price.product
      : price.product && typeof price.product === "object"
        ? price.product.id
        : "";

  const type =
    price.type === "recurring" ? ("recurring" as const) : ("one_time" as const);

  const interval = price.recurring?.interval ?? null;
  const recurringInterval =
    interval === "day" ||
    interval === "week" ||
    interval === "month" ||
    interval === "year"
      ? interval
      : null;

  return {
    id: price.id,
    productId,
    active: Boolean(price.active),
    currency: price.currency,
    unitAmount: price.unit_amount,
    type,
    recurringInterval,
    lookupKey: price.lookup_key,
  };
}

/**
 * List Stripe Prices for a lookup key (read-only).
 * Does not filter active at the API layer so inactive can be rejected explicitly.
 */
export function createStripeCatalogPriceLister(
  secretKey?: string | null,
): ListPricesByLookupKey {
  return async (lookupKey: string): Promise<StripePriceSnapshot[]> => {
    const stripe = getStripeClient(secretKey);
    const result = await stripe.prices.list({
      lookup_keys: [lookupKey],
      limit: 10,
      expand: ["data.product"],
    });
    return result.data.map((price) => toPriceSnapshot(price));
  };
}

/**
 * Read-only Stripe Price retrieve for webhook plan correlation when lookup_key
 * is absent from the event payload. Never creates/updates Prices.
 */
export function createStripePriceByIdRetriever(
  secretKey?: string | null,
): (priceId: string) => Promise<StripePriceSnapshot | null> {
  return async (priceId: string): Promise<StripePriceSnapshot | null> => {
    const id = priceId.trim();
    if (!id) return null;
    const stripe = getStripeClient(secretKey);
    try {
      const price = await stripe.prices.retrieve(id);
      return toPriceSnapshot(price);
    } catch {
      return null;
    }
  };
}
