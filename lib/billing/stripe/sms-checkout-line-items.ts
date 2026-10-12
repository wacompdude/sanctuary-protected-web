/**
 * Read-only Checkout Session line items for the paid SMS webhook.
 * Self-checks must not import this module.
 */

import type Stripe from "stripe";
import type { StripePriceSnapshot } from "@/lib/billing/stripe/catalog";
import { getStripeClient } from "@/lib/billing/stripe/sdk";
import type {
  ListSmsCheckoutLineItems,
  SmsCheckoutLineItem,
} from "@/lib/billing/stripe/sms-purchase-webhook";

function snapshotFromPrice(price: Stripe.Price): StripePriceSnapshot {
  const product = price.product;
  const productId =
    typeof product === "string"
      ? product
      : product && typeof product === "object" && "id" in product
        ? product.id
        : "";
  const interval = String(price.recurring?.interval ?? "");
  const recurringInterval: StripePriceSnapshot["recurringInterval"] =
    interval === "day" ||
    interval === "week" ||
    interval === "month" ||
    interval === "year"
      ? interval
      : null;
  return {
    id: price.id,
    productId,
    active: price.active,
    currency: price.currency,
    unitAmount: price.unit_amount,
    type: price.type === "recurring" ? "recurring" : "one_time",
    recurringInterval,
    lookupKey: price.lookup_key,
  };
}

function toLineItem(item: Stripe.LineItem): SmsCheckoutLineItem {
  const rawPrice = item.price as Stripe.Price | string | null;
  if (typeof rawPrice === "string") {
    return {
      quantity: item.quantity,
      priceId: rawPrice,
      price: null,
      amountSubtotal: item.amount_subtotal,
      amountTax: item.amount_tax,
      amountTotal: item.amount_total,
      amountDiscount: item.amount_discount,
      currency: item.currency,
    };
  }
  return {
    quantity: item.quantity,
    priceId: rawPrice?.id ?? null,
    price: rawPrice ? snapshotFromPrice(rawPrice) : null,
    amountSubtotal: item.amount_subtotal,
    amountTax: item.amount_tax,
    amountTotal: item.amount_total,
    amountDiscount: item.amount_discount,
    currency: item.currency,
  };
}

export function createStripeCheckoutLineItemLister(
  secretKey?: string | null,
): ListSmsCheckoutLineItems {
  return async (sessionId: string) => {
    const stripe = getStripeClient(secretKey);
    const page = await stripe.checkout.sessions.listLineItems(sessionId, {
      limit: 10,
    });
    return {
      items: page.data.map(toLineItem),
      hasMore: page.has_more,
    };
  };
}
