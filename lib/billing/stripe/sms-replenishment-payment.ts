/**
 * Off-session PaymentIntent rules for one claimed SMS replenishment attempt.
 * Building these parameters does not call Stripe or grant credits.
 */

import { automaticReplenishmentProviderKey } from "@/lib/billing/sms-auto-replenishment";

export const SMS_REPLENISHMENT_PURPOSE = "sms_auto_replenishment";
export const SMS_REPLENISHMENT_CURRENCY = "usd";

const ATTEMPT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAYMENT_INTENT_ID = /^pi_[A-Za-z0-9_]{1,252}$/;

export type SmsReplenishmentChargeSnapshot = {
  attemptId: string;
  organizationId: string;
  paymentMethodId: string;
  customerId: string;
  expectedAmountCents: number;
  currency: "USD";
  packageSegments: number;
  planKey: string;
  packageKey: string;
  providerIdempotencyKey: string;
};

export type SmsReplenishmentPaymentIntentParams = {
  amount: number;
  currency: "usd";
  customer: string;
  payment_method: string;
  off_session: true;
  confirm: true;
  allowed_payment_method_types: ["card"];
  metadata: {
    sanctuary_purpose: typeof SMS_REPLENISHMENT_PURPOSE;
    organization_id: string;
    replenishment_attempt_id: string;
    plan_key: string;
    sms_segments: string;
  };
};

export type SmsReplenishmentPaymentStatus =
  | "succeeded"
  | "processing"
  | "requires_action"
  | "requires_payment_method"
  | "canceled";

export type ClassifiedSmsReplenishmentPayment =
  | {
      disposition: "pending_webhook";
      providerPaymentId: string;
      grantsCredits: false;
    }
  | {
      disposition: "definitive_failure";
      providerPaymentId: string | null;
      safeFailureCode: string;
      grantsCredits: false;
    }
  | {
      disposition: "ambiguous";
      grantsCredits: false;
    };

export function smsAutoReplenishmentProviderIdempotencyKey(attemptId: string): string {
  const id = attemptId.trim();
  if (!ATTEMPT_ID.test(id)) {
    throw new Error("SMS replenishment attempt id is invalid.");
  }
  return automaticReplenishmentProviderKey(id);
}

export function smsAutoReplenishmentPaymentIntentParams(
  input: SmsReplenishmentChargeSnapshot,
): SmsReplenishmentPaymentIntentParams {
  const attemptId = input.attemptId.trim();
  const organizationId = input.organizationId.trim();
  const customerId = input.customerId.trim();
  const paymentMethodId = input.paymentMethodId.trim();
  if (!ATTEMPT_ID.test(attemptId)) {
    throw new Error("SMS replenishment attempt id is invalid.");
  }
  if (!ATTEMPT_ID.test(organizationId)) {
    throw new Error("SMS replenishment organization id is invalid.");
  }
  if (!customerId.startsWith("cus_") || paymentMethodId.startsWith("pm_") === false) {
    throw new Error("SMS replenishment Stripe identity is invalid.");
  }
  if (!Number.isInteger(input.expectedAmountCents) || input.expectedAmountCents <= 0) {
    throw new Error("SMS replenishment amount is invalid.");
  }
  if (!Number.isInteger(input.packageSegments) || input.packageSegments <= 0) {
    throw new Error("SMS replenishment quantity is invalid.");
  }
  if (input.currency !== "USD") {
    throw new Error("SMS replenishment currency is invalid.");
  }
  const idempotencyKey = input.providerIdempotencyKey.trim();
  if (idempotencyKey !== smsAutoReplenishmentProviderIdempotencyKey(attemptId)) {
    throw new Error("SMS replenishment idempotency key does not match the attempt.");
  }
  const planKey = input.planKey.trim();
  if (!planKey || planKey.length > 64) {
    throw new Error("SMS replenishment plan key is invalid.");
  }

  return {
    amount: input.expectedAmountCents,
    currency: SMS_REPLENISHMENT_CURRENCY,
    customer: customerId,
    payment_method: paymentMethodId,
    off_session: true,
    confirm: true,
    allowed_payment_method_types: ["card"],
    metadata: {
      sanctuary_purpose: SMS_REPLENISHMENT_PURPOSE,
      organization_id: organizationId,
      replenishment_attempt_id: attemptId,
      plan_key: planKey,
      sms_segments: String(input.packageSegments),
    },
  };
}

export function isSmsReplenishmentPaymentIntentId(value: string | null | undefined): boolean {
  return typeof value === "string" && PAYMENT_INTENT_ID.test(value);
}

function safeFailureCode(value: string | null | undefined, fallback: string): string {
  const code = (value ?? "").trim().toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 64);
  return code || fallback;
}

export function classifySmsReplenishmentPaymentStatus(input: {
  id: string | null;
  status: string | null;
}): ClassifiedSmsReplenishmentPayment {
  const id = input.id && isSmsReplenishmentPaymentIntentId(input.id) ? input.id : null;
  if (input.status === "succeeded" || input.status === "processing") {
    if (!id) return { disposition: "ambiguous", grantsCredits: false };
    return { disposition: "pending_webhook", providerPaymentId: id, grantsCredits: false };
  }
  if (
    input.status === "requires_action" ||
    input.status === "requires_payment_method" ||
    input.status === "canceled"
  ) {
    return {
      disposition: "definitive_failure",
      providerPaymentId: id,
      safeFailureCode: input.status,
      grantsCredits: false,
    };
  }
  return { disposition: "ambiguous", grantsCredits: false };
}

const AMBIGUOUS_ERROR_TYPES = new Set([
  "StripeConnectionError",
  "StripeAPIError",
  "StripeRateLimitError",
  "StripeIdempotencyError",
  "StripePermissionError",
]);

export function classifySmsReplenishmentPaymentError(input: {
  type: string | null;
  code: string | null;
  providerPaymentId: string | null;
}): ClassifiedSmsReplenishmentPayment {
  const providerPaymentId = isSmsReplenishmentPaymentIntentId(input.providerPaymentId)
    ? input.providerPaymentId
    : null;
  if (input.type && AMBIGUOUS_ERROR_TYPES.has(input.type)) {
    return { disposition: "ambiguous", grantsCredits: false };
  }
  if (input.type === "StripeCardError") {
    return {
      disposition: "definitive_failure",
      providerPaymentId,
      safeFailureCode: safeFailureCode(input.code, "card_declined"),
      grantsCredits: false,
    };
  }
  if (input.type === "StripeInvalidRequestError" && !providerPaymentId) {
    return {
      disposition: "definitive_failure",
      providerPaymentId: null,
      safeFailureCode: safeFailureCode(input.code, "invalid_request"),
      grantsCredits: false,
    };
  }
  return { disposition: "ambiguous", grantsCredits: false };
}
