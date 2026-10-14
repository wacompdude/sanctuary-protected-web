/**
 * Paid one-time SMS package recording for checkout.session.completed.
 * Stripe remains the financial authority. This module does not grant credits
 * until the paid Price, amounts, customer, and metadata agree.
 * Injectable seams keep self-checks off the Stripe network.
 */

import { COMMERCIAL_PLAN_CATALOG } from "@/lib/billing/commercial-catalog";
import type { SmsPaidPackageResult } from "@/lib/billing/sms-paid-purchase";
import type { GetStripePriceById } from "@/lib/billing/stripe/plan-correlation";
import type { StripePriceSnapshot } from "@/lib/billing/stripe/catalog";
import type { StripeWebhookObjectSummary } from "@/lib/billing/stripe/webhook-verify";

export class SmsPurchaseRejectedError extends Error {
  readonly code: string;
  /** True when Stripe already reported a paid SMS Checkout. */
  readonly paid: boolean;
  readonly organizationId: string | null;

  constructor(
    message: string,
    code: string,
    paid: boolean,
    organizationId: string | null = null,
  ) {
    super(message);
    this.name = "SmsPurchaseRejectedError";
    this.code = code;
    this.paid = paid;
    this.organizationId = organizationId;
  }
}

export class SmsPurchaseRecordingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SmsPurchaseRecordingError";
  }
}

export type SmsCheckoutLineItem = {
  quantity: number | null;
  priceId: string | null;
  price: StripePriceSnapshot | null;
  amountSubtotal: number;
  amountTax: number;
  amountTotal: number;
  amountDiscount: number;
  currency: string;
};

export type SmsCheckoutLineItemPage = {
  items: SmsCheckoutLineItem[];
  hasMore: boolean;
};

export type ListSmsCheckoutLineItems = (
  sessionId: string,
) => Promise<SmsCheckoutLineItemPage>;

export type RecordPaidSmsPackage = (input: {
  organizationId: string;
  segments: number;
  amountCents: number;
  taxCents: number;
  idempotencyKey: string;
  providerPaymentId: string | null;
  metadata: Record<string, unknown>;
}) => Promise<SmsPaidPackageResult>;

export type SmsPurchaseOrganizationStore = {
  findOrganizationByStripeCustomerId(
    customerId: string,
  ): Promise<{ organizationId: string; providerCustomerId: string } | null>;
  organizationExists?(organizationId: string): Promise<boolean>;
  getMappedStripeCustomerId?(organizationId: string): Promise<string | null>;
};

export type SmsPurchaseHandlerDeps = {
  listCheckoutLineItems?: ListSmsCheckoutLineItems;
  recordPaidSmsPackage?: RecordPaidSmsPackage;
  getPriceById?: GetStripePriceById;
};

export type SmsPurchaseHandlerResult = {
  outcome: "processed" | "ignored" | "rejected";
  detail: string;
  organizationId: string | null;
  metadata: Record<string, unknown>;
};

export function isSmsPackageCheckoutCandidate(
  object: StripeWebhookObjectSummary,
): boolean {
  return object.metadataSanctuaryCheckout === "sms_package";
}

export function smsPurchaseIdempotencyKey(checkoutSessionId: string): string {
  return `sms:purchase:${checkoutSessionId}`;
}

function reject(
  message: string,
  code: string,
  paid: boolean,
  organizationId: string | null = null,
): never {
  throw new SmsPurchaseRejectedError(message, code, paid, organizationId);
}

function requireMoney(
  value: number | null | undefined,
  label: string,
  organizationId: string | null,
): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    reject(
      `Checkout ${label} is missing.`,
      "sms_amount_mismatch",
      true,
      organizationId,
    );
  }
  return value;
}

export async function handlePaidSmsPackageCheckout(
  store: SmsPurchaseOrganizationStore,
  object: StripeWebhookObjectSummary,
  deps: SmsPurchaseHandlerDeps = {},
): Promise<SmsPurchaseHandlerResult> {
  try {
    return await recordPaidSmsPackageCheckout(store, object, deps);
  } catch (error) {
    if (error instanceof SmsPurchaseRejectedError) {
      if (error.paid) {
        return {
          outcome: "rejected",
          detail: error.message,
          organizationId: error.organizationId,
          metadata: {
            sms_package_purchase: false,
            sms_paid_validation_failed: true,
            sms_validation_code: error.code,
            checkout_session_id: object.checkoutSessionId,
            authoritative_activation: false,
          },
        };
      }
      return {
        outcome: "ignored",
        detail: error.message,
        organizationId: null,
        metadata: {
          sms_package_purchase: false,
          sms_validation_code: error.code,
          checkout_session_id: object.checkoutSessionId,
          authoritative_activation: false,
        },
      };
    }
    throw error;
  }
}

async function recordPaidSmsPackageCheckout(
  store: SmsPurchaseOrganizationStore,
  object: StripeWebhookObjectSummary,
  deps: SmsPurchaseHandlerDeps,
): Promise<SmsPurchaseHandlerResult> {
  if (object.mode !== "payment") {
    reject("SMS Checkout mode must be payment.", "sms_checkout_not_payment", false);
  }
  if (object.paymentStatus !== "paid") {
    reject("SMS Checkout payment is not paid.", "sms_checkout_not_paid", false);
  }
  const sessionId = object.checkoutSessionId?.trim() ?? "";
  if (!sessionId) {
    reject("SMS Checkout is missing a session id.", "sms_checkout_session_missing", true);
  }

  const organizationId = object.metadataOrganizationId?.trim() ?? "";
  if (!organizationId) {
    reject(
      "SMS Checkout is missing organization metadata.",
      "sms_organization_missing",
      true,
    );
  }
  let knownOrganizationId: string | null = null;
  const customerId = object.customerId?.trim() ?? "";
  if (!customerId) {
    reject("SMS Checkout is missing a Stripe customer.", "sms_customer_missing", true);
  }
  if (store.organizationExists) {
    const exists = await store.organizationExists(organizationId);
    if (!exists) {
      reject(
        "SMS Checkout organization does not exist.",
        "sms_organization_invalid",
        true,
      );
    }
    knownOrganizationId = organizationId;
  }
  if (store.getMappedStripeCustomerId) {
    const mapped = await store.getMappedStripeCustomerId(organizationId);
    if (!mapped || mapped !== customerId) {
      reject(
        "SMS Checkout customer does not match the organization.",
        "sms_customer_mismatch",
        true,
        knownOrganizationId,
      );
    }
  }
  const byCustomer = await store.findOrganizationByStripeCustomerId(customerId);
  if (!byCustomer || byCustomer.organizationId !== organizationId) {
    reject(
      "SMS Checkout customer does not match the organization.",
      "sms_customer_mismatch",
      true,
      knownOrganizationId,
    );
  }
  if (byCustomer.providerCustomerId !== customerId) {
    reject(
      "SMS Checkout customer does not match the organization.",
      "sms_customer_mismatch",
      true,
      knownOrganizationId,
    );
  }
  knownOrganizationId = organizationId;

  if (!deps.listCheckoutLineItems) {
    throw new SmsPurchaseRecordingError(
      "SMS Checkout line items are not configured.",
    );
  }
  const page = await deps.listCheckoutLineItems(sessionId);
  if (page.hasMore || page.items.length !== 1) {
    reject(
      "SMS Checkout must contain exactly one line item.",
      "sms_line_items_invalid",
      true,
      knownOrganizationId,
    );
  }
  const line = page.items[0]!;
  if (line.quantity !== 1) {
    reject(
      "SMS Checkout quantity must be 1.",
      "sms_quantity_invalid",
      true,
      knownOrganizationId,
    );
  }
  if (line.currency.toLowerCase() !== "usd") {
    reject(
      "SMS Checkout currency must be USD.",
      "sms_currency_invalid",
      true,
      knownOrganizationId,
    );
  }

  let price = line.price;
  if (!price && line.priceId) {
    if (!deps.getPriceById) {
      throw new SmsPurchaseRecordingError(
        "SMS Checkout price retrieve is not configured.",
      );
    }
    price = await deps.getPriceById(line.priceId);
  }
  if (!price) {
    reject(
      "SMS Checkout line item is missing a Price.",
      "sms_price_missing",
      true,
      knownOrganizationId,
    );
  }
  if (!price.active) {
    reject(
      "SMS Checkout Price is inactive.",
      "sms_price_inactive",
      true,
      knownOrganizationId,
    );
  }
  if (price.currency.toLowerCase() !== "usd") {
    reject(
      "SMS Checkout Price currency must be USD.",
      "sms_currency_invalid",
      true,
      knownOrganizationId,
    );
  }
  if (price.type !== "one_time" || price.recurringInterval) {
    reject(
      "SMS Checkout Price must be one-time.",
      "sms_price_recurring",
      true,
      knownOrganizationId,
    );
  }
  const lookupKey = price.lookupKey?.trim() ?? "";
  const entry = COMMERCIAL_PLAN_CATALOG.find(
    (candidate) => candidate.smsPackageLookupKey === lookupKey,
  );
  if (!entry) {
    reject(
      "SMS Checkout Price is not an approved package.",
      "sms_package_unknown",
      true,
      knownOrganizationId,
    );
  }
  if (price.unitAmount !== entry.smsPackagePriceCents) {
    reject(
      "SMS Checkout Price amount does not match the package.",
      "sms_amount_mismatch",
      true,
      knownOrganizationId,
    );
  }

  const subtotal = requireMoney(object.amountSubtotal, "subtotal", knownOrganizationId);
  const total = requireMoney(object.amountTotal, "total", knownOrganizationId);
  const tax = requireMoney(object.amountTax, "tax", knownOrganizationId);
  const discount = requireMoney(object.amountDiscount, "discount", knownOrganizationId);
  if (
    subtotal !== entry.smsPackagePriceCents ||
    line.amountSubtotal !== entry.smsPackagePriceCents
  ) {
    reject(
      "SMS Checkout subtotal does not match the package.",
      "sms_amount_mismatch",
      true,
      knownOrganizationId,
    );
  }
  if (
    tax < 0 ||
    line.amountTax !== tax ||
    line.amountTotal !== subtotal + tax ||
    total !== subtotal + tax ||
    discount !== 0 ||
    line.amountDiscount !== 0
  ) {
    reject(
      "SMS Checkout total does not match the package and tax.",
      tax !== line.amountTax || total !== subtotal + tax ? "sms_tax_mismatch" : "sms_amount_mismatch",
      true,
      knownOrganizationId,
    );
  }
  const sessionCurrency = object.currency?.toLowerCase() ?? "";
  if (sessionCurrency !== "usd") {
    reject(
      "SMS Checkout currency must be USD.",
      "sms_currency_invalid",
      true,
      knownOrganizationId,
    );
  }

  if (object.metadataLookupKey !== entry.smsPackageLookupKey) {
    reject(
      "SMS Checkout lookup metadata does not match the paid package.",
      "sms_metadata_mismatch",
      true,
      knownOrganizationId,
    );
  }
  if (object.metadataPackageKey !== entry.smsExtraItemKey) {
    reject(
      "SMS Checkout package metadata does not match the paid package.",
      "sms_metadata_mismatch",
      true,
      knownOrganizationId,
    );
  }
  if (object.metadataPlanKey !== entry.planKey) {
    reject(
      "SMS Checkout plan metadata does not match the paid package.",
      "sms_metadata_mismatch",
      true,
      knownOrganizationId,
    );
  }
  if (!/^[1-9]\d*$/.test(object.metadataSmsSegments ?? "")) {
    reject(
      "SMS Checkout segment metadata is malformed.",
      "sms_metadata_mismatch",
      true,
      knownOrganizationId,
    );
  }
  if (object.metadataSmsSegments !== String(entry.smsPackageCredits)) {
    reject(
      "SMS Checkout segment metadata does not match the paid package.",
      "sms_metadata_mismatch",
      true,
      knownOrganizationId,
    );
  }

  if (!deps.recordPaidSmsPackage) {
    throw new SmsPurchaseRecordingError("SMS purchase recorder is not configured.");
  }

  const idempotencyKey = smsPurchaseIdempotencyKey(sessionId);
  const metadata = {
    stripe_checkout_session_id: sessionId,
    package_key: entry.smsExtraItemKey,
    lookup_key: entry.smsPackageLookupKey,
    plan_key_at_checkout: entry.planKey,
  };
  const result = await deps.recordPaidSmsPackage({
    organizationId,
    segments: entry.smsPackageCredits,
    amountCents: subtotal,
    taxCents: tax,
    idempotencyKey,
    providerPaymentId: object.paymentIntentId ?? null,
    metadata,
  });

  if (result.outcome === "idempotency_mismatch") {
    reject(
      "SMS purchase idempotency does not match the recorded purchase.",
      "sms_purchase_idempotency_mismatch",
      true,
      knownOrganizationId,
    );
  }
  if (result.outcome === "reconciliation_required") {
    reject(
      "SMS purchase records require reconciliation.",
      "sms_purchase_reconciliation_required",
      true,
      knownOrganizationId,
    );
  }
  if (!result.ok || (result.outcome !== "recorded" && result.outcome !== "duplicate")) {
    throw new SmsPurchaseRecordingError("sms_purchase_recording_failed");
  }

  return {
    outcome: "processed",
    detail:
      result.outcome === "duplicate"
        ? "SMS credit purchase was already recorded."
        : "SMS credit purchase recorded.",
    organizationId,
    metadata: {
      sms_package_purchase: true,
      sms_purchase_outcome: result.outcome,
      checkout_session_id: sessionId,
      purchase_idempotency_key: idempotencyKey,
      credited_segments: result.creditedSegments,
      authoritative_activation: false,
    },
  };
}
