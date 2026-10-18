/**
 * Service-role database access for SMS replenishment settlement.
 * Does not call Stripe.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import type { SmsReplenishmentSettlementStore } from "@/lib/billing/stripe/sms-replenishment-webhook";

export async function smsReplenishmentRpc(
  name: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc(name, args);
  if (error) {
    throw new Error("SMS replenishment database request failed.");
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return {};
  return data as Record<string, unknown>;
}

export function createSmsReplenishmentSettlementStore(): SmsReplenishmentSettlementStore {
  return {
    async getAttempt(attemptId) {
      const admin = createAdminClient();
      const { data, error } = await admin
        .from("organization_sms_replenishment_attempts")
        .select(
          "id, organization_id, status, expected_amount_cents, tax_cents, currency, provider_payment_id, package_segments",
        )
        .eq("id", attemptId)
        .maybeSingle();
      if (error || !data) return null;
      return {
        id: String(data.id),
        organizationId: String(data.organization_id),
        status: String(data.status),
        expectedAmountCents: Number(data.expected_amount_cents),
        taxCents: Number(data.tax_cents),
        currency: String(data.currency),
        providerPaymentId:
          typeof data.provider_payment_id === "string" ? data.provider_payment_id : null,
        packageSegments: Number(data.package_segments),
      };
    },
    async getOrganizationCustomerId(organizationId) {
      const admin = createAdminClient();
      const { data } = await admin
        .from("organization_billing_profiles")
        .select("provider_customer_id")
        .eq("organization_id", organizationId)
        .eq("billing_provider", "stripe")
        .maybeSingle();
      return typeof data?.provider_customer_id === "string"
        ? data.provider_customer_id
        : null;
    },
    async grant(input) {
      const row = await smsReplenishmentRpc("record_automatic_application_sms_replenishment", {
        p_attempt_id: input.attemptId,
        p_provider_payment_id: input.providerPaymentId,
        p_amount_cents: input.amountCents,
        p_tax_cents: input.taxCents,
        p_metadata: { source: "payment_intent_succeeded" },
      });
      return { ok: row.ok === true, outcome: String(row.outcome ?? "unknown") };
    },
    async fail(input) {
      const row = await smsReplenishmentRpc("fail_application_sms_replenishment_payment", {
        p_attempt_id: input.attemptId,
        p_safe_failure_code: input.safeFailureCode,
      });
      return { ok: row.ok === true, outcome: String(row.outcome ?? "unknown") };
    },
    async notifySuccess(attempt) {
      const { notifySmsReplenishmentSuccess } = await import(
        "@/lib/billing/stripe/sms-replenishment-notices-live"
      );
      await notifySmsReplenishmentSuccess({
        organizationId: attempt.organizationId,
        attemptId: attempt.id,
        credits: attempt.packageSegments,
        subtotalCents: attempt.expectedAmountCents,
        taxCents: attempt.taxCents,
      });
    },
    async notifyPaymentAttention(attempt) {
      const { notifySmsReplenishmentPaymentAttention } = await import(
        "@/lib/billing/stripe/sms-replenishment-notices-live"
      );
      await notifySmsReplenishmentPaymentAttention({
        organizationId: attempt.organizationId,
        attemptId: attempt.id,
      });
    },
  };
}
