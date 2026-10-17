/**
 * Server-only entry for automatic SMS replenishment orchestration.
 * No route, cron, SMS send, or Billing action imports this module.
 * Calling it creates a Stripe Tax Calculation and may create a PaymentIntent.
 * It does not grant SMS credits.
 */

import "server-only";

import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { createStripeCatalogPriceLister } from "@/lib/billing/stripe/catalog-stripe";
import { getStripeClient } from "@/lib/billing/stripe/client";
import {
  isStripeSdkError,
  logStripeBillingError,
} from "@/lib/billing/stripe/safe-error-log";
import { executeAutomaticSmsReplenishmentAttempt } from "@/lib/billing/stripe/sms-replenishment-live";
import {
  runAutomaticSmsReplenishmentOrchestration,
  type OpenSmsReplenishmentAttempt,
  type SmsReplenishmentOrchestrationResult,
  type SmsReplenishmentTaxCalculationView,
} from "@/lib/billing/stripe/sms-replenishment-orchestrator";
import {
  createSmsReplenishmentSettlementStore,
  smsReplenishmentRpc,
} from "@/lib/billing/stripe/sms-replenishment-store";
import { smsPurchaseTaxCollectionAuthorized } from "@/lib/billing/stripe/sms-purchase-tax";

function lineAmount(calculation: Stripe.Tax.Calculation): number | null {
  const line = calculation.line_items?.data?.[0];
  return line && Number.isInteger(line.amount) ? line.amount : null;
}

function calculationCustomerId(calculation: Stripe.Tax.Calculation): string | null {
  return typeof calculation.customer === "string" ? calculation.customer : null;
}

function viewFromCalculation(
  calculation: Stripe.Tax.Calculation,
): SmsReplenishmentTaxCalculationView {
  return {
    id: calculation.id,
    currency: calculation.currency,
    amountTotal: calculation.amount_total,
    taxAmountExclusive: calculation.tax_amount_exclusive,
    taxAmountInclusive: calculation.tax_amount_inclusive,
    expiresAt: calculation.expires_at,
    lineAmountCents: lineAmount(calculation),
    customerId: calculationCustomerId(calculation),
  };
}

async function loadOpenAttempt(
  organizationId: string,
): Promise<OpenSmsReplenishmentAttempt | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("organization_sms_replenishment_attempts")
    .select(
      "id, organization_id, status, expected_amount_cents, plan_key, package_key, tax_calculation_id, tax_calculation_expires_at, provider_payment_id",
    )
    .eq("organization_id", organizationId)
    .in("status", ["claimed", "charging", "payment_pending"])
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: String(data.id),
    organizationId: String(data.organization_id),
    status: String(data.status),
    expectedAmountCents: Number(data.expected_amount_cents),
    planKey: String(data.plan_key),
    packageKey: String(data.package_key),
    taxCalculationId:
      typeof data.tax_calculation_id === "string" ? data.tax_calculation_id : null,
    taxCalculationExpiresAt:
      typeof data.tax_calculation_expires_at === "string"
        ? data.tax_calculation_expires_at
        : null,
    providerPaymentId:
      typeof data.provider_payment_id === "string" ? data.provider_payment_id : null,
  };
}

export async function orchestrateAutomaticSmsReplenishment(
  organizationId: string,
): Promise<SmsReplenishmentOrchestrationResult> {
  const stripe = getStripeClient();
  const store = createSmsReplenishmentSettlementStore();
  const listPackagePrices = createStripeCatalogPriceLister();
  return runAutomaticSmsReplenishmentOrchestration(organizationId, {
    claim: (id) =>
      smsReplenishmentRpc("claim_application_sms_replenishment", {
        p_organization_id: id,
      }),
    loadBillingAddress: async (id) => {
      const admin = createAdminClient();
      const { data, error } = await admin
        .from("organization_billing_profiles")
        .select("billing_address")
        .eq("organization_id", id)
        .maybeSingle();
      if (error) return null;
      return data?.billing_address ?? null;
    },
    loadCustomerId: (id) => store.getOrganizationCustomerId(id),
    listPackagePrices,
    createTaxCalculation: async ({ attemptId, params }) => {
      try {
        const calculation = await stripe.tax.calculations.create(params, {
          idempotencyKey: `sms_auto_tax_${attemptId}`,
        });
        return viewFromCalculation(calculation);
      } catch (error) {
        if (isStripeSdkError(error)) {
          logStripeBillingError("sms_replenishment_tax_calculation", error);
        }
        throw error;
      }
    },
    recordTaxSnapshot: (input) =>
      smsReplenishmentRpc("record_application_sms_replenishment_tax_snapshot", {
        p_attempt_id: input.attemptId,
        p_calculation_id: input.calculationId,
        p_tax_cents: input.taxCents,
        p_total_cents: input.totalCents,
        p_expires_at: input.expiresAt,
      }),
    markTaxAttention: (id, safeCode) =>
      smsReplenishmentRpc("mark_application_sms_replenishment_tax_attention", {
        p_organization_id: id,
        p_safe_code: safeCode,
      }),
    loadOpenAttempt,
    executeAttempt: (attemptId) => executeAutomaticSmsReplenishmentAttempt(attemptId),
    taxCollectionAuthorized: smsPurchaseTaxCollectionAuthorized(),
    nowSeconds: Math.floor(Date.now() / 1000),
  });
}
