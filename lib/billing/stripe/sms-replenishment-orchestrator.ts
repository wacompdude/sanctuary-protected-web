/**
 * Server sequence for one automatic SMS replenishment.
 *
 * Claim, tax calculation, tax snapshot, and PaymentIntent execution stay in
 * their existing functions. This module does not grant credits, import Stripe,
 * or start a charge by itself. The server-only entry point supplies those
 * boundaries. The permanent production caller is the post-commit trigger.
 */

import { commercialPlanByKey } from "@/lib/billing/commercial-catalog";
import type { StripePriceSnapshot } from "@/lib/billing/stripe/catalog";
import {
  interpretSmsPurchaseTaxCalculation,
  readSmsBillingAddress,
  smsPurchaseTaxCalculationParams,
  type SmsPurchaseTaxCalculationResult,
} from "@/lib/billing/stripe/sms-purchase-tax";

export type SmsReplenishmentOrchestrationResult = {
  outcome: string;
  grantsCredits: false;
  attemptId: string | null;
  providerPaymentId: string | null;
};

type AttemptExecutionResult = {
  outcome: string;
  grantsCredits: false;
  providerPaymentId: string | null;
};

export type SmsReplenishmentTaxCalculationView = SmsPurchaseTaxCalculationResult & {
  lineAmountCents: number | null;
  customerId: string | null;
};

export type OpenSmsReplenishmentAttempt = {
  id: string;
  organizationId: string;
  status: string;
  expectedAmountCents: number;
  planKey: string;
  packageKey: string;
  taxCalculationId: string | null;
  taxCalculationExpiresAt: string | null;
  providerPaymentId: string | null;
};

export type SmsReplenishmentOrchestratorDeps = {
  claim: (organizationId: string) => Promise<Record<string, unknown>>;
  loadBillingAddress: (organizationId: string) => Promise<unknown>;
  loadCustomerId: (organizationId: string) => Promise<string | null>;
  listPackagePrices: (lookupKey: string) => Promise<StripePriceSnapshot[]>;
  createTaxCalculation: (input: {
    attemptId: string;
    params: ReturnType<typeof smsPurchaseTaxCalculationParams>;
  }) => Promise<SmsReplenishmentTaxCalculationView>;
  recordTaxSnapshot: (input: {
    attemptId: string;
    calculationId: string;
    taxCents: number;
    totalCents: number;
    expiresAt: string;
  }) => Promise<Record<string, unknown>>;
  markTaxAttention: (
    organizationId: string,
    safeCode: string,
  ) => Promise<Record<string, unknown>>;
  loadOpenAttempt: (
    organizationId: string,
  ) => Promise<OpenSmsReplenishmentAttempt | null>;
  executeAttempt: (attemptId: string) => Promise<AttemptExecutionResult>;
  taxCollectionAuthorized: boolean;
  nowSeconds: number;
};

const SAFE_CODE = /^[a-z0-9_]{1,64}$/;

function stopped(
  outcome: string,
  attemptId: string | null = null,
): SmsReplenishmentOrchestrationResult {
  return {
    outcome,
    grantsCredits: false,
    attemptId,
    providerPaymentId: null,
  };
}

function fromExecution(
  attemptId: string,
  execution: AttemptExecutionResult,
): SmsReplenishmentOrchestrationResult {
  return {
    outcome: execution.outcome,
    grantsCredits: false,
    attemptId,
    providerPaymentId: execution.providerPaymentId,
  };
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function integer(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function safeCode(value: string): string {
  return SAFE_CODE.test(value) ? value : "tax_invalid";
}

async function attention(
  deps: SmsReplenishmentOrchestratorDeps,
  organizationId: string,
  attemptId: string | null,
  code: string,
): Promise<SmsReplenishmentOrchestrationResult> {
  await deps.markTaxAttention(organizationId, safeCode(code));
  return stopped("tax_attention_required", attemptId);
}

function snapshotIsCurrent(
  attempt: OpenSmsReplenishmentAttempt,
  nowSeconds: number,
): boolean {
  if (!attempt.taxCalculationId?.startsWith("taxcalc_")) return false;
  const expiresAt = Date.parse(attempt.taxCalculationExpiresAt ?? "");
  return Number.isFinite(expiresAt) && expiresAt > nowSeconds * 1000;
}

async function catalogProduct(
  deps: SmsReplenishmentOrchestratorDeps,
  planKey: string,
  packageKey: string,
  subtotalCents: number,
): Promise<{ productId: string } | { code: string }> {
  const plan = commercialPlanByKey(planKey);
  if (!plan || plan.smsExtraItemKey !== packageKey) return { code: "catalog_invalid" };
  if (plan.smsPackagePriceCents !== subtotalCents) return { code: "catalog_invalid" };
  let prices: StripePriceSnapshot[];
  try {
    prices = await deps.listPackagePrices(plan.smsPackageLookupKey);
  } catch {
    return { code: "catalog_unavailable" };
  }
  const matches = prices.filter(
    (price) =>
      price.active &&
      price.type === "one_time" &&
      price.currency.toLowerCase() === "usd" &&
      price.unitAmount === subtotalCents &&
      price.lookupKey === plan.smsPackageLookupKey &&
      price.productId.startsWith("prod_"),
  );
  if (matches.length !== 1) return { code: "catalog_invalid" };
  return { productId: matches[0].productId };
}

async function prepareTaxAndCharge(
  deps: SmsReplenishmentOrchestratorDeps,
  organizationId: string,
  attempt: {
    id: string;
    expectedAmountCents: number;
    planKey: string;
    packageKey: string;
  },
): Promise<SmsReplenishmentOrchestrationResult> {
  const address = readSmsBillingAddress(await deps.loadBillingAddress(organizationId));
  if (!address) {
    return attention(deps, organizationId, attempt.id, "address_required");
  }
  if (!deps.taxCollectionAuthorized) {
    return attention(deps, organizationId, attempt.id, "tax_collection_not_authorized");
  }

  const customerId = await deps.loadCustomerId(organizationId);
  if (!customerId?.startsWith("cus_")) {
    return attention(deps, organizationId, attempt.id, "customer_missing");
  }

  const product = await catalogProduct(
    deps,
    attempt.planKey,
    attempt.packageKey,
    attempt.expectedAmountCents,
  );
  if ("code" in product) {
    return attention(deps, organizationId, attempt.id, product.code);
  }

  let calculation: SmsReplenishmentTaxCalculationView;
  try {
    calculation = await deps.createTaxCalculation({
      attemptId: attempt.id,
      params: smsPurchaseTaxCalculationParams({
        subtotalCents: attempt.expectedAmountCents,
        address,
        productId: product.productId,
      }),
    });
  } catch {
    return attention(deps, organizationId, attempt.id, "tax_calculation_unavailable");
  }

  if (
    calculation.lineAmountCents !== attempt.expectedAmountCents ||
    (calculation.customerId !== null && calculation.customerId !== customerId)
  ) {
    return attention(deps, organizationId, attempt.id, "calculation_invalid");
  }

  const interpreted = interpretSmsPurchaseTaxCalculation({
    calculation,
    packageSubtotalCents: attempt.expectedAmountCents,
    nowSeconds: deps.nowSeconds,
  });
  if (!interpreted.ok) {
    return attention(deps, organizationId, attempt.id, interpreted.reason);
  }

  const recorded = await deps.recordTaxSnapshot({
    attemptId: attempt.id,
    calculationId: interpreted.calculationId,
    taxCents: interpreted.taxCents,
    totalCents: interpreted.totalCents,
    expiresAt: interpreted.expiresAt,
  });
  if (recorded.ok !== true) {
    return stopped(text(recorded.outcome) || "tax_not_ready", attempt.id);
  }

  return fromExecution(attempt.id, await deps.executeAttempt(attempt.id));
}

export async function runAutomaticSmsReplenishmentOrchestration(
  organizationId: string,
  deps: SmsReplenishmentOrchestratorDeps,
): Promise<SmsReplenishmentOrchestrationResult> {
  const claim = await deps.claim(organizationId);
  const claimOutcome = text(claim.outcome);

  if (claim.ok === true && claimOutcome === "claimed") {
    const attemptId = text(claim.attempt_id);
    const subtotalCents = integer(claim.expected_amount_cents);
    const planKey = text(claim.plan_key);
    const packageKey = text(claim.package_key);
    if (!attemptId || subtotalCents == null || subtotalCents <= 0 || !planKey || !packageKey) {
      return attention(deps, organizationId, attemptId || null, "claim_invalid");
    }
    return prepareTaxAndCharge(deps, organizationId, {
      id: attemptId,
      expectedAmountCents: subtotalCents,
      planKey,
      packageKey,
    });
  }

  if (claimOutcome !== "open_attempt_exists") {
    return stopped(claimOutcome || "not_eligible");
  }

  const open = await deps.loadOpenAttempt(organizationId);
  if (!open || open.organizationId !== organizationId) {
    return stopped("open_attempt_exists");
  }
  if (open.status === "payment_pending" || open.status === "charging") {
    return fromExecution(open.id, await deps.executeAttempt(open.id));
  }
  if (open.status !== "claimed") {
    return stopped("open_attempt_exists", open.id);
  }
  if (snapshotIsCurrent(open, deps.nowSeconds)) {
    return fromExecution(open.id, await deps.executeAttempt(open.id));
  }
  if (!Number.isInteger(open.expectedAmountCents) || open.expectedAmountCents <= 0) {
    return attention(deps, organizationId, open.id, "claim_invalid");
  }
  return prepareTaxAndCharge(deps, organizationId, {
    id: open.id,
    expectedAmountCents: open.expectedAmountCents,
    planKey: open.planKey,
    packageKey: open.packageKey,
  });
}
