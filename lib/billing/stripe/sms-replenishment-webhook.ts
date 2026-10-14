/**
 * Settlement for automatic SMS replenishment PaymentIntents.
 * A verified webhook is required. The Stripe HTTP response never grants credits.
 */

import { SMS_REPLENISHMENT_PURPOSE } from "@/lib/billing/stripe/sms-replenishment-payment";
import type { StripeWebhookObjectSummary } from "@/lib/billing/stripe/webhook-verify";
import type { WebhookHandlerResult } from "@/lib/billing/stripe/webhook-sync";

export type SmsReplenishmentAttemptRecord = {
  id: string;
  organizationId: string;
  status: string;
  expectedAmountCents: number;
  currency: string;
  providerPaymentId: string | null;
  packageSegments: number;
};

export type SmsReplenishmentSettlementStore = {
  getAttempt(attemptId: string): Promise<SmsReplenishmentAttemptRecord | null>;
  getOrganizationCustomerId(organizationId: string): Promise<string | null>;
  grant(input: {
    attemptId: string;
    providerPaymentId: string;
    amountCents: number;
    taxCents: number;
  }): Promise<{ ok: boolean; outcome: string }>;
  fail(input: {
    attemptId: string;
    safeFailureCode: string;
  }): Promise<{ ok: boolean; outcome: string }>;
};

function ignored(detail: string): WebhookHandlerResult {
  return { outcome: "ignored", detail, organizationId: null, metadata: {} };
}

function rejected(detail: string, organizationId: string | null): WebhookHandlerResult {
  return {
    outcome: "rejected",
    detail,
    organizationId,
    metadata: { sms_auto_replenishment: true },
  };
}

function processed(
  detail: string,
  organizationId: string,
  outcome: string,
): WebhookHandlerResult {
  return {
    outcome: "processed",
    detail,
    organizationId,
    metadata: { sms_auto_replenishment: true, settlement: outcome },
  };
}

export function isSmsReplenishmentPaymentEvent(
  eventType: string,
  object: StripeWebhookObjectSummary,
): boolean {
  if (eventType !== "payment_intent.succeeded" && eventType !== "payment_intent.payment_failed") {
    return false;
  }
  return object.metadataSanctuaryPurpose === SMS_REPLENISHMENT_PURPOSE;
}

export async function settleSmsReplenishmentPaymentEvent(input: {
  eventType: string;
  object: StripeWebhookObjectSummary;
  store: SmsReplenishmentSettlementStore;
}): Promise<WebhookHandlerResult> {
  if (!isSmsReplenishmentPaymentEvent(input.eventType, input.object)) {
    return ignored("PaymentIntent is not an automatic SMS replenishment.");
  }

  const attemptId = input.object.metadataReplenishmentAttemptId;
  const organizationId = input.object.metadataOrganizationId;
  const providerPaymentId = input.object.paymentIntentId ?? input.object.id;
  if (!attemptId || !organizationId || !providerPaymentId) {
    return rejected("Automatic SMS replenishment PaymentIntent is missing correlation.", organizationId);
  }

  const attempt = await input.store.getAttempt(attemptId);
  if (!attempt) {
    return rejected("Automatic SMS replenishment attempt was not found.", organizationId);
  }
  if (attempt.organizationId !== organizationId) {
    return rejected("Automatic SMS replenishment organization does not match.", organizationId);
  }
  if (attempt.providerPaymentId && attempt.providerPaymentId !== providerPaymentId) {
    return rejected("Automatic SMS replenishment PaymentIntent does not match the attempt.", organizationId);
  }
  if (input.object.currency !== "usd" || attempt.currency.toUpperCase() !== "USD") {
    return rejected("Automatic SMS replenishment currency does not match.", organizationId);
  }
  if (input.object.amount !== attempt.expectedAmountCents) {
    return rejected("Automatic SMS replenishment amount does not match.", organizationId);
  }

  const customerId = await input.store.getOrganizationCustomerId(organizationId);
  if (!customerId || input.object.customerId !== customerId) {
    return rejected("Automatic SMS replenishment customer does not match.", organizationId);
  }

  if (input.eventType === "payment_intent.payment_failed") {
    const failed = await input.store.fail({
      attemptId,
      safeFailureCode: "payment_failed",
    });
    if (!failed.ok && failed.outcome !== "duplicate" && failed.outcome !== "already_settled") {
      throw new Error("Automatic SMS replenishment failure was not recorded.");
    }
    if (failed.outcome === "already_settled") {
      return rejected("Automatic SMS replenishment was already settled.", organizationId);
    }
    return processed("Automatic SMS replenishment payment failed.", organizationId, failed.outcome);
  }

  const granted = await input.store.grant({
    attemptId,
    providerPaymentId,
    amountCents: attempt.expectedAmountCents,
    taxCents: 0,
  });
  if (!granted.ok) {
    if (granted.outcome === "invalid_state" || granted.outcome === "idempotency_mismatch" || granted.outcome === "reconciliation_required") {
      return rejected(`Automatic SMS replenishment grant ${granted.outcome}.`, organizationId);
    }
    throw new Error("Automatic SMS replenishment grant was not recorded.");
  }
  return processed("Automatic SMS replenishment payment settled.", organizationId, granted.outcome);
}
