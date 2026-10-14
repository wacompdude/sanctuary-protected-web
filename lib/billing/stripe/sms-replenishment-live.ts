/**
 * Server execution of one durable SMS replenishment attempt.
 * Creates or retries one off-session PaymentIntent. Does not grant credits.
 */

import "server-only";

import type Stripe from "stripe";
import { getStripeClient } from "@/lib/billing/stripe/client";
import {
  classifySmsReplenishmentPaymentError,
  classifySmsReplenishmentPaymentStatus,
  isSmsReplenishmentPaymentIntentId,
  smsAutoReplenishmentPaymentIntentParams,
  type ClassifiedSmsReplenishmentPayment,
  type SmsReplenishmentChargeSnapshot,
} from "@/lib/billing/stripe/sms-replenishment-payment";
import {
  createSmsReplenishmentSettlementStore,
  smsReplenishmentRpc,
} from "@/lib/billing/stripe/sms-replenishment-store";
import {
  isStripeSdkError,
  logStripeBillingError,
} from "@/lib/billing/stripe/safe-error-log";

export type SmsReplenishmentExecutionResult = {
  outcome: string;
  grantsCredits: false;
  providerPaymentId: string | null;
};

type BeginChargeRow = {
  ok?: boolean;
  outcome?: string;
  attempt_id?: string;
  organization_id?: string;
  payment_method_id?: string | null;
  expected_amount_cents?: number;
  currency?: string;
  package_segments?: number;
  plan_key?: string;
  package_key?: string;
  provider_idempotency_key?: string;
  provider_payment_id?: string | null;
};

type RpcRow = { ok?: boolean; outcome?: string };

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function stripeErrorParts(error: unknown): { type: string | null; code: string | null } {
  const record = asRecord(error);
  return {
    type: typeof record?.type === "string" ? record.type : error instanceof Error ? error.name : null,
    code: typeof record?.code === "string" ? record.code : null,
  };
}

function paymentIntentIdFromError(error: unknown): string | null {
  const paymentIntent = asRecord(error)?.payment_intent;
  if (typeof paymentIntent === "string") return paymentIntent;
  const id = asRecord(paymentIntent)?.id;
  return typeof id === "string" ? id : null;
}

async function customerIdForOrganization(organizationId: string): Promise<string | null> {
  return createSmsReplenishmentSettlementStore().getOrganizationCustomerId(organizationId);
}

async function persistProviderPayment(attemptId: string, providerPaymentId: string): Promise<void> {
  const row = (await smsReplenishmentRpc("record_application_sms_replenishment_provider_payment", {
    p_attempt_id: attemptId,
    p_provider_payment_id: providerPaymentId,
  })) as RpcRow;
  if (row.ok !== true && row.outcome !== "duplicate") {
    throw new Error("SMS replenishment PaymentIntent could not be correlated.");
  }
}

async function failAttempt(attemptId: string, safeFailureCode: string): Promise<void> {
  const row = (await smsReplenishmentRpc("fail_application_sms_replenishment_payment", {
    p_attempt_id: attemptId,
    p_safe_failure_code: safeFailureCode,
  })) as RpcRow;
  if (row.ok !== true && row.outcome !== "duplicate" && row.outcome !== "already_settled") {
    throw new Error("SMS replenishment failure could not be recorded.");
  }
}

async function applyClassification(
  attemptId: string,
  classified: ClassifiedSmsReplenishmentPayment,
): Promise<SmsReplenishmentExecutionResult> {
  if (classified.disposition === "ambiguous") {
    return { outcome: "ambiguous", grantsCredits: false, providerPaymentId: null };
  }
  if (classified.disposition === "pending_webhook") {
    await persistProviderPayment(attemptId, classified.providerPaymentId);
    return {
      outcome: "payment_pending",
      grantsCredits: false,
      providerPaymentId: classified.providerPaymentId,
    };
  }
  if (classified.providerPaymentId) {
    await persistProviderPayment(attemptId, classified.providerPaymentId);
  }
  await failAttempt(attemptId, classified.safeFailureCode);
  return {
    outcome: "failed",
    grantsCredits: false,
    providerPaymentId: classified.providerPaymentId,
  };
}

export async function executeAutomaticSmsReplenishmentAttempt(
  attemptId: string,
): Promise<SmsReplenishmentExecutionResult> {
  const begun = (await smsReplenishmentRpc("begin_application_sms_replenishment_charge", {
    p_attempt_id: attemptId,
  })) as BeginChargeRow;

  if (begun.outcome === "awaiting_settlement") {
    return {
      outcome: "awaiting_settlement",
      grantsCredits: false,
      providerPaymentId: begun.provider_payment_id ?? null,
    };
  }
  if (begun.ok !== true || begun.outcome !== "charging") {
    return {
      outcome: begun.outcome ?? "not_executable",
      grantsCredits: false,
      providerPaymentId: null,
    };
  }

  const organizationId = begun.organization_id ?? "";
  const customerId = await customerIdForOrganization(organizationId);
  if (!customerId) {
    await failAttempt(attemptId, "customer_missing");
    return { outcome: "failed", grantsCredits: false, providerPaymentId: null };
  }

  const snapshot: SmsReplenishmentChargeSnapshot = {
    attemptId,
    organizationId,
    paymentMethodId: begun.payment_method_id ?? "",
    customerId,
    expectedAmountCents: Number(begun.expected_amount_cents),
    currency: "USD",
    packageSegments: Number(begun.package_segments),
    planKey: begun.plan_key ?? "",
    packageKey: begun.package_key ?? "",
    providerIdempotencyKey: begun.provider_idempotency_key ?? "",
  };

  const stripe = getStripeClient();
  let paymentMethod: Stripe.PaymentMethod;
  try {
    paymentMethod = await stripe.paymentMethods.retrieve(snapshot.paymentMethodId);
  } catch (error) {
    logStripeBillingError("sms_replenishment_payment_create", error);
    if (!isStripeSdkError(error)) {
      return { outcome: "ambiguous", grantsCredits: false, providerPaymentId: null };
    }
    const parts = stripeErrorParts(error);
    const classified = classifySmsReplenishmentPaymentError({
      type: parts.type,
      code: parts.code,
      providerPaymentId: null,
    });
    return applyClassification(attemptId, classified);
  }

  const paymentMethodCustomer =
    typeof paymentMethod.customer === "string" ? paymentMethod.customer : null;
  if (paymentMethod.type !== "card" || paymentMethodCustomer !== customerId) {
    await failAttempt(
      attemptId,
      paymentMethod.type === "card"
        ? "payment_method_customer_mismatch"
        : "unsupported_payment_method",
    );
    return { outcome: "failed", grantsCredits: false, providerPaymentId: null };
  }

  const params = smsAutoReplenishmentPaymentIntentParams(snapshot);
  try {
    const paymentIntent = await stripe.paymentIntents.create(params, {
      idempotencyKey: snapshot.providerIdempotencyKey,
    });
    return applyClassification(
      attemptId,
      classifySmsReplenishmentPaymentStatus({
        id: paymentIntent.id,
        status: paymentIntent.status,
      }),
    );
  } catch (error) {
    logStripeBillingError("sms_replenishment_payment_create", error);
    if (!isStripeSdkError(error)) {
      return { outcome: "ambiguous", grantsCredits: false, providerPaymentId: null };
    }
    const parts = stripeErrorParts(error);
    const classified = classifySmsReplenishmentPaymentError({
      type: parts.type,
      code: parts.code,
      providerPaymentId: paymentIntentIdFromError(error),
    });
    if (
      classified.disposition === "definitive_failure" &&
      classified.providerPaymentId &&
      !isSmsReplenishmentPaymentIntentId(classified.providerPaymentId)
    ) {
      return { outcome: "ambiguous", grantsCredits: false, providerPaymentId: null };
    }
    return applyClassification(attemptId, classified);
  }
}
