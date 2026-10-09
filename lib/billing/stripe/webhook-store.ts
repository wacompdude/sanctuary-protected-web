/**
 * Supabase-backed webhook sync store (service role).
 */

import { createAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { BillingConfigurationError } from "@/lib/billing/errors";
import type {
  SyncedSubscriptionSnapshot,
  WebhookSyncStore,
} from "@/lib/billing/stripe/webhook-sync";
import type { ChurchSubscriptionStatus } from "@/lib/subscriptions/types";
import {
  PLAN_DISPLAY_NAMES,
  isPlanKey,
  type PlanKey,
} from "@/lib/subscriptions/plan-keys";

function mapSubRow(
  row: Record<string, unknown>,
  planKey: string,
): SyncedSubscriptionSnapshot {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    planId: String(row.plan_id),
    planKey,
    status: row.status as ChurchSubscriptionStatus,
    billingSubscriptionId:
      typeof row.billing_subscription_id === "string"
        ? row.billing_subscription_id
        : null,
    paymentStatus:
      typeof row.payment_status === "string" ? row.payment_status : null,
  };
}

export function createAdminWebhookSyncStore(): WebhookSyncStore {
  if (!isServiceRoleConfigured()) {
    throw new BillingConfigurationError(
      "SUPABASE_SERVICE_ROLE_KEY is required for Stripe webhook synchronization.",
    );
  }
  const admin = createAdminClient();

  return {
    async findOrganizationByStripeCustomerId(customerId) {
      const { data: profile } = await admin
        .from("organization_billing_profiles")
        .select("organization_id, provider_customer_id")
        .eq("billing_provider", "stripe")
        .eq("provider_customer_id", customerId)
        .maybeSingle();
      if (profile?.organization_id) {
        return {
          organizationId: String(profile.organization_id),
          providerCustomerId: String(profile.provider_customer_id),
        };
      }

      const { data: legacy } = await admin
        .from("billing_customers")
        .select("organization_id, provider_customer_id")
        .eq("billing_provider", "stripe")
        .eq("provider_customer_id", customerId)
        .maybeSingle();
      if (!legacy?.organization_id) return null;
      return {
        organizationId: String(legacy.organization_id),
        providerCustomerId: String(legacy.provider_customer_id),
      };
    },

    async getPlanIdByKey(planKey: PlanKey) {
      const { data } = await admin
        .from("subscription_plans")
        .select("id")
        .eq("plan_key", planKey)
        .maybeSingle();
      return data?.id ? String(data.id) : null;
    },

    async getSubscriptionByProviderId(providerSubscriptionId) {
      const { data } = await admin
        .from("organization_subscriptions")
        .select(
          "id, organization_id, plan_id, status, billing_subscription_id, payment_status",
        )
        .eq("billing_provider", "stripe")
        .eq("billing_subscription_id", providerSubscriptionId)
        .maybeSingle();
      if (!data) return null;
      const { data: plan } = await admin
        .from("subscription_plans")
        .select("plan_key")
        .eq("id", data.plan_id)
        .maybeSingle();
      return mapSubRow(
        data as Record<string, unknown>,
        plan?.plan_key ? String(plan.plan_key) : "",
      );
    },

    async getCurrentSubscription(organizationId) {
      const { data } = await admin
        .from("organization_subscriptions")
        .select(
          "id, organization_id, plan_id, status, billing_subscription_id, payment_status",
        )
        .eq("organization_id", organizationId)
        .in("status", [
          "trialing",
          "active",
          "past_due",
          "grace_period",
          "incomplete",
        ])
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!data) return null;
      const { data: plan } = await admin
        .from("subscription_plans")
        .select("plan_key")
        .eq("id", data.plan_id)
        .maybeSingle();
      return mapSubRow(
        data as Record<string, unknown>,
        plan?.plan_key ? String(plan.plan_key) : "",
      );
    },

    async upsertSubscription(input) {
      const byProvider = await this.getSubscriptionByProviderId(
        input.billingSubscriptionId,
      );
      const current =
        byProvider ?? (await this.getCurrentSubscription(input.organizationId));

      if (!current) {
        const { data, error } = await admin
          .from("organization_subscriptions")
          .insert({
            organization_id: input.organizationId,
            plan_id: input.planId,
            status: input.status,
            billing_interval: "month",
            billing_provider: "stripe",
            billing_customer_id: input.billingCustomerId,
            billing_subscription_id: input.billingSubscriptionId,
            current_period_start: input.currentPeriodStart,
            current_period_end: input.currentPeriodEnd,
            cancel_at_period_end: input.cancelAtPeriodEnd,
            cancelled_at: input.cancelledAt,
            payment_status: input.paymentStatus ?? "unknown",
            provider_latest_invoice_id: input.providerLatestInvoiceId ?? null,
          })
          .select(
            "id, organization_id, plan_id, status, billing_subscription_id, payment_status",
          )
          .single();
        if (error || !data) {
          throw new Error(
            `Unable to create organization_subscriptions row: ${error?.message ?? "unknown"}`,
          );
        }
        return {
          subscription: mapSubRow(data as Record<string, unknown>, input.planKey),
          created: true,
          planChanged: true,
          statusChanged: true,
          previousPlanId: null,
          previousStatus: null,
        };
      }

      const previousPlanId = current.planId;
      const previousStatus = current.status;
      const periodPatch =
        input.currentPeriodStart && input.currentPeriodEnd
          ? {
              current_period_start: input.currentPeriodStart,
              current_period_end: input.currentPeriodEnd,
            }
          : {};
      const { data, error } = await admin
        .from("organization_subscriptions")
        .update({
          plan_id: input.planId,
          status: input.status,
          billing_provider: "stripe",
          billing_customer_id: input.billingCustomerId,
          billing_subscription_id: input.billingSubscriptionId,
          ...periodPatch,
          cancel_at_period_end: input.cancelAtPeriodEnd,
          cancelled_at: input.cancelledAt,
          ...(input.paymentStatus
            ? { payment_status: input.paymentStatus }
            : {}),
          ...(input.providerLatestInvoiceId
            ? { provider_latest_invoice_id: input.providerLatestInvoiceId }
            : {}),
        })
        .eq("id", current.id)
        .select(
          "id, organization_id, plan_id, status, billing_subscription_id, payment_status",
        )
        .single();
      if (error || !data) {
        throw new Error(
          `Unable to update organization_subscriptions: ${error?.message ?? "unknown"}`,
        );
      }
      return {
        subscription: mapSubRow(data as Record<string, unknown>, input.planKey),
        created: false,
        planChanged: previousPlanId !== input.planId,
        statusChanged: previousStatus !== input.status,
        previousPlanId,
        previousStatus,
      };
    },

    async writeChangeHistory(input) {
      await admin.from("subscription_change_history").insert({
        organization_id: input.organizationId,
        subscription_id: input.subscriptionId,
        old_plan_id: input.oldPlanId,
        new_plan_id: input.newPlanId,
        old_status: input.oldStatus,
        new_status: input.newStatus,
        change_type: input.changeType,
        reason: input.reason,
        metadata: input.metadata,
      });
    },

    async hasChangeHistoryForProviderEvent(providerEventId) {
      const eventId = providerEventId.trim();
      if (!eventId) return false;
      const { data } = await admin
        .from("subscription_change_history")
        .select("id")
        .contains("metadata", { stripe_event_id: eventId })
        .limit(1)
        .maybeSingle();
      return Boolean(data?.id);
    },

    async upsertInvoice(input) {
      const { data: existing } = await admin
        .from("billing_invoices")
        .select("id")
        .eq("billing_provider", "stripe")
        .eq("provider_invoice_id", input.providerInvoiceId)
        .maybeSingle();

      if (existing?.id) {
        const periodPatch =
          input.periodStart && input.periodEnd
            ? {
                period_start: input.periodStart,
                period_end: input.periodEnd,
              }
            : {};
        await admin
          .from("billing_invoices")
          .update({
            status: input.status,
            currency: input.currency,
            total_cents: input.totalCents,
            amount_paid_cents: input.amountPaidCents,
            amount_due_cents: input.amountDueCents,
            ...periodPatch,
            hosted_invoice_url: input.hostedInvoiceUrl,
            metadata: input.metadata,
          })
          .eq("id", existing.id);
        return { id: String(existing.id), created: false };
      }

      const { data, error } = await admin
        .from("billing_invoices")
        .insert({
          organization_id: input.organizationId,
          billing_provider: "stripe",
          provider_invoice_id: input.providerInvoiceId,
          status: input.status,
          currency: input.currency,
          subtotal_cents: input.totalCents,
          total_cents: input.totalCents,
          amount_paid_cents: input.amountPaidCents,
          amount_due_cents: input.amountDueCents,
          period_start: input.periodStart,
          period_end: input.periodEnd,
          hosted_invoice_url: input.hostedInvoiceUrl,
          metadata: input.metadata,
        })
        .select("id")
        .single();
      if (error || !data) {
        if (error?.code === "23505") {
          const { data: raced } = await admin
            .from("billing_invoices")
            .select("id")
            .eq("billing_provider", "stripe")
            .eq("provider_invoice_id", input.providerInvoiceId)
            .maybeSingle();
          if (raced?.id) return { id: String(raced.id), created: false };
        }
        throw new Error(
          `Unable to upsert billing_invoices: ${error?.message ?? "unknown"}`,
        );
      }
      return { id: String(data.id), created: true };
    },

    async insertTransaction(input) {
      const { data: existing } = await admin
        .from("billing_transactions")
        .select("id")
        .eq("organization_id", input.organizationId)
        .eq("idempotency_key", input.idempotencyKey)
        .maybeSingle();
      if (existing?.id) {
        return { id: String(existing.id), created: false };
      }

      const { data, error } = await admin
        .from("billing_transactions")
        .insert({
          organization_id: input.organizationId,
          invoice_id: input.invoiceId,
          transaction_type: input.transactionType,
          status: input.status,
          currency: input.currency,
          amount_cents: input.amountCents,
          billing_provider: "stripe",
          provider_invoice_id: input.providerInvoiceId,
          idempotency_key: input.idempotencyKey,
          description: input.description,
          metadata: input.metadata,
        })
        .select("id")
        .single();

      if (error || !data) {
        if (error?.code === "23505") {
          const { data: raced } = await admin
            .from("billing_transactions")
            .select("id")
            .eq("organization_id", input.organizationId)
            .eq("idempotency_key", input.idempotencyKey)
            .maybeSingle();
          if (raced?.id) return { id: String(raced.id), created: false };
        }
        throw new Error(
          `Unable to insert billing_transactions: ${error?.message ?? "unknown"}`,
        );
      }
      return { id: String(data.id), created: true };
    },

    async updateSubscriptionPaymentStatus(input) {
      let query = admin
        .from("organization_subscriptions")
        .update({
          payment_status: input.paymentStatus,
          ...(input.providerLatestInvoiceId
            ? { provider_latest_invoice_id: input.providerLatestInvoiceId }
            : {}),
        })
        .eq("organization_id", input.organizationId)
        .eq("billing_provider", "stripe");

      if (input.billingSubscriptionId) {
        query = query.eq(
          "billing_subscription_id",
          input.billingSubscriptionId,
        );
      }

      await query;
    },

    async activateTrialOrganization(organizationId) {
      const { data, error } = await admin.rpc(
        "activate_organization_after_paid_base_subscription",
        { p_organization_id: organizationId },
      );
      if (error) {
        throw new Error(
          `Unable to activate trial organization: ${error.message}`,
        );
      }
      if (data === "activated" || data === "noop" || data === "unchanged") {
        return data;
      }
      return "unchanged";
    },

    async syncOrganizationPlanName(input) {
      if (!isPlanKey(input.planKey)) return;
      const { error } = await admin
        .from("organizations")
        .update({ plan_name: PLAN_DISPLAY_NAMES[input.planKey] })
        .eq("id", input.organizationId);
      if (error) {
        console.error(
          "Failed to sync organization plan name:",
          error.message,
        );
      }
    },

    async notifyBillingCharge() {
      // Resend billing transaction notices hook in later phase.
      // Intentionally no-op until EMAIL_FROM_BILLING wiring is authorized.
    },
  };
}
