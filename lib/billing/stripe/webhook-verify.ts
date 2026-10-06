/**
 * Stripe webhook signature verification (Phase 4B-4).
 * Verifies Stripe-Signature against the exact raw request body.
 * Never logs secrets or raw payloads.
 */

import Stripe from "stripe";
import {
  BillingConfigurationError,
} from "@/lib/billing/errors";
import {
  readStripeWebhookSecret,
} from "@/lib/billing/stripe/config";
import type { WebhookPriceItemRef } from "@/lib/billing/stripe/plan-correlation";

export type StripeWebhookVerifyResult =
  | {
      ok: true;
      eventId: string;
      eventType: string;
      apiVersion: string | null;
      created: number | null;
      /** Sanitized object summary for handlers — not the raw Stripe payload. */
      object: StripeWebhookObjectSummary;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

export type StripeWebhookObjectSummary = {
  objectType: string;
  id: string | null;
  customerId: string | null;
  subscriptionId: string | null;
  invoiceId: string | null;
  checkoutSessionId: string | null;
  /** All subscription/invoice line price refs (id and/or lookup_key). */
  priceItems: WebhookPriceItemRef[];
  /** Convenience: first price id when present (not entitlement authority alone). */
  priceId: string | null;
  priceLookupKey: string | null;
  status: string | null;
  mode: string | null;
  paymentStatus: string | null;
  amountPaid: number | null;
  amountDue: number | null;
  currency: string | null;
  hostedInvoiceUrl: string | null;
  periodStart: number | null;
  periodEnd: number | null;
  cancelAtPeriodEnd: boolean | null;
  metadataOrganizationId: string | null;
  metadataPlanKey: string | null;
};

export type StripeWebhookConstructFn = (input: {
  rawBody: string;
  signature: string;
  webhookSecret: string;
}) => Stripe.Event;

export function defaultStripeWebhookConstruct(
  input: {
    rawBody: string;
    signature: string;
    webhookSecret: string;
  },
): Stripe.Event {
  return Stripe.webhooks.constructEvent(
    input.rawBody,
    input.signature,
    input.webhookSecret,
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function str(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value && typeof value === "object" && "id" in value) {
    const id = (value as { id?: unknown }).id;
    if (typeof id === "string" && id.trim()) return id.trim();
  }
  return null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function bool(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function priceRefFromUnknown(value: unknown): WebhookPriceItemRef | null {
  if (typeof value === "string" && value.trim()) {
    return {
      priceId: value.trim(),
      lookupKey: null,
      productName: null,
    };
  }
  const price = asRecord(value);
  if (!price) return null;
  const priceId = str(price.id);
  const lookupKey = str(price.lookup_key);
  if (!priceId && !lookupKey) return null;

  let productName: string | null = null;
  const product = price.product;
  if (typeof product === "string") {
    productName = null; // product id string — not a display name
  } else {
    const productObj = asRecord(product);
    productName = str(productObj?.name);
  }

  return { priceId, lookupKey, productName };
}

/**
 * Extract price refs whether Stripe sent expanded Price objects or bare IDs.
 * Does not assume Product expansion.
 */
export function extractWebhookPriceItems(
  obj: Record<string, unknown>,
): WebhookPriceItemRef[] {
  const items: WebhookPriceItemRef[] = [];
  const seen = new Set<string>();

  const push = (ref: WebhookPriceItemRef | null) => {
    if (!ref) return;
    const key = `${ref.priceId ?? ""}|${ref.lookupKey ?? ""}`;
    if (!key || key === "|") return;
    if (seen.has(key)) return;
    seen.add(key);
    items.push(ref);
  };

  const subscriptionItems = asRecord(obj.items);
  const itemData = Array.isArray(subscriptionItems?.data)
    ? subscriptionItems.data
    : [];
  for (const entry of itemData) {
    const row = asRecord(entry);
    push(priceRefFromUnknown(row?.price));
  }

  // Invoice lines (when present)
  const lines = asRecord(obj.lines);
  const lineData = Array.isArray(lines?.data) ? lines.data : [];
  for (const entry of lineData) {
    const row = asRecord(entry);
    push(priceRefFromUnknown(row?.price));
    const pricing = asRecord(row?.pricing);
    const priceDetails = asRecord(pricing?.price_details);
    if (priceDetails?.price) {
      push(priceRefFromUnknown(priceDetails.price));
    }
  }

  // Top-level price (rare)
  push(priceRefFromUnknown(obj.price));

  return items;
}

export function summarizeStripeEventObject(
  event: Stripe.Event,
): StripeWebhookObjectSummary {
  const obj = asRecord(event.data?.object) ?? {};
  const objectType = str(obj.object) ?? "unknown";
  const priceItems = extractWebhookPriceItems(obj);
  const metadata = asRecord(obj.metadata) ?? {};

  let invoiceId = objectType === "invoice" ? str(obj.id) : str(obj.invoice);
  let subscriptionId =
    objectType === "subscription" ? str(obj.id) : str(obj.subscription);
  const checkoutSessionId =
    objectType === "checkout.session" ? str(obj.id) : null;

  if (!subscriptionId && objectType === "invoice") {
    subscriptionId = str(obj.subscription);
  }
  if (objectType === "checkout.session") {
    subscriptionId = subscriptionId ?? str(obj.subscription);
    invoiceId = invoiceId ?? str(obj.invoice);
  }

  return {
    objectType,
    id: str(obj.id),
    customerId: str(obj.customer),
    subscriptionId,
    invoiceId,
    checkoutSessionId,
    priceItems,
    priceId: priceItems[0]?.priceId ?? null,
    priceLookupKey: priceItems[0]?.lookupKey ?? null,
    status: str(obj.status),
    mode: str(obj.mode),
    paymentStatus: str(obj.payment_status),
    amountPaid: num(obj.amount_paid),
    amountDue: num(obj.amount_due),
    currency: str(obj.currency)?.toLowerCase() ?? null,
    hostedInvoiceUrl: str(obj.hosted_invoice_url),
    periodStart: num(obj.current_period_start) ?? num(obj.period_start),
    periodEnd: num(obj.current_period_end) ?? num(obj.period_end),
    cancelAtPeriodEnd: bool(obj.cancel_at_period_end),
    metadataOrganizationId: str(metadata.organization_id),
    metadataPlanKey: str(metadata.plan_key),
  };
}

export function verifyStripeWebhookSignature(input: {
  rawBody: string;
  headers: Headers;
  webhookSecret?: string | null;
  constructEvent?: StripeWebhookConstructFn;
}): StripeWebhookVerifyResult {
  const secret = (input.webhookSecret ?? readStripeWebhookSecret()).trim();
  if (!secret) {
    throw new BillingConfigurationError(
      "STRIPE_WEBHOOK_SECRET is missing or empty.",
    );
  }

  const signature =
    input.headers.get("stripe-signature") ||
    input.headers.get("Stripe-Signature") ||
    "";

  if (!signature.trim()) {
    return {
      ok: false,
      status: 400,
      error: "Missing Stripe-Signature header.",
    };
  }

  if (!input.rawBody) {
    return {
      ok: false,
      status: 400,
      error: "Empty webhook body.",
    };
  }

  const construct = input.constructEvent ?? defaultStripeWebhookConstruct;
  try {
    const event = construct({
      rawBody: input.rawBody,
      signature,
      webhookSecret: secret,
    });
    const object = summarizeStripeEventObject(event);
    return {
      ok: true,
      eventId: event.id,
      eventType: event.type,
      apiVersion: event.api_version ?? null,
      created: event.created ?? null,
      object,
    };
  } catch {
    return {
      ok: false,
      status: 400,
      error: "Invalid Stripe webhook signature.",
    };
  }
}
