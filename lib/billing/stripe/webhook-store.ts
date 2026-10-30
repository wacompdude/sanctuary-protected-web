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
    cancelAtPeriodEnd:
      typeof row.cancel_at_period_end === "boolean"
        ? row.cancel_at_period_end
        : undefined,
  };
}

export function createAdminWebhookSyncStore(): WebhookSyncStore {
  if (!isServiceRoleConfigured()) {
    throw new BillingConfigurationError(
      "SUPABASE_SERVICE_ROLE_KEY is required for Stripe webhook synchronization.",
    );
  }
  const admin = createAdminClient();

  async function withScheduleMirror(
    snapshot: SyncedSubscriptionSnapshot,
  ): Promise<SyncedSubscriptionSnapshot> {
    const { data, error } = await admin
      .from("organization_subscriptions")
      .select(
        "billing_customer_id, provider_schedule_id, schedule_status, scheduled_plan_id, scheduled_effective_at",
      )
      .eq("id", snapshot.id)
      .maybeSingle();
    if (error || !data) {
      if (error) {
        console.error(
          "Failed to read subscription schedule mirror:",
          error.message.slice(0, 160),
        );
      }
      return snapshot;
    }
    let scheduledPlanKey: string | null = null;
    if (data.scheduled_plan_id) {
      const { data: scheduledPlan } = await admin
        .from("subscription_plans")
        .select("plan_key")
        .eq("id", data.scheduled_plan_id)
        .maybeSingle();
      scheduledPlanKey = scheduledPlan?.plan_key
        ? String(scheduledPlan.plan_key)
        : null;
    }
    return {
      ...snapshot,
      billingCustomerId:
        typeof data.billing_customer_id === "string"
          ? data.billing_customer_id
          : null,
      providerScheduleId:
        typeof data.provider_schedule_id === "string"
          ? data.provider_schedule_id
          : null,
      scheduleStatus:
        typeof data.schedule_status === "string" ? data.schedule_status : null,
      scheduledPlanId:
        typeof data.scheduled_plan_id === "string" ? data.scheduled_plan_id : null,
      scheduledPlanKey,
      scheduledEffectiveAt:
        typeof data.scheduled_effective_at === "string"
          ? data.scheduled_effective_at
          : null,
    };
  }

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

    async organizationExists(organizationId) {
      const { data } = await admin
        .from("organizations")
        .select("id")
        .eq("id", organizationId)
        .maybeSingle();
      return Boolean(data?.id);
    },

    async getMappedStripeCustomerId(organizationId) {
      const { data: profile } = await admin
        .from("organization_billing_profiles")
        .select("provider_customer_id")
        .eq("organization_id", organizationId)
        .eq("billing_provider", "stripe")
        .maybeSingle();
      const fromProfile =
        typeof profile?.provider_customer_id === "string"
          ? profile.provider_customer_id.trim()
          : "";
      if (fromProfile) return fromProfile;

      const { data: legacy } = await admin
        .from("billing_customers")
        .select("provider_customer_id")
        .eq("organization_id", organizationId)
        .eq("billing_provider", "stripe")
        .maybeSingle();
      const fromLegacy =
        typeof legacy?.provider_customer_id === "string"
          ? legacy.provider_customer_id.trim()
          : "";
      return fromLegacy || null;
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
          "id, organization_id, plan_id, status, billing_subscription_id, payment_status, cancel_at_period_end",
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
      return withScheduleMirror(
        mapSubRow(
          data as Record<string, unknown>,
          plan?.plan_key ? String(plan.plan_key) : "",
        ),
      );
    },

    async getCurrentSubscription(organizationId) {
      const { data } = await admin
        .from("organization_subscriptions")
        .select(
          "id, organization_id, plan_id, status, billing_subscription_id, payment_status, cancel_at_period_end",
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
      return withScheduleMirror(
        mapSubRow(
          data as Record<string, unknown>,
          plan?.plan_key ? String(plan.plan_key) : "",
        ),
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
            "id, organization_id, plan_id, status, billing_subscription_id, payment_status, cancel_at_period_end",
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
          "id, organization_id, plan_id, status, billing_subscription_id, payment_status, cancel_at_period_end",
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

    async hasChangeHistoryForProviderEvent(providerEventId, changeType) {
      const eventId = providerEventId.trim();
      if (!eventId) return false;
      let query = admin
        .from("subscription_change_history")
        .select("id")
        .contains("metadata", { stripe_event_id: eventId });
      if (changeType) query = query.eq("change_type", changeType);
      const { data } = await query.limit(1).maybeSingle();
      return Boolean(data?.id);
    },

    async hasCancellationTransition(transitionKey) {
      const key = transitionKey.trim();
      if (!key) return false;
      const { data } = await admin
        .from("subscription_change_history")
        .select("id")
        .contains("metadata", { cancellation_transition: key })
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
            ...(input.taxDetermined
              ? {
                  subtotal_cents: input.subtotalCents,
                  tax_cents: input.taxCents ?? 0,
                }
              : {}),
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
          subtotal_cents: input.subtotalCents ?? input.totalCents,
          tax_cents: input.taxCents ?? 0,
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
          tax_cents: input.taxCents ?? 0,
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

    async syncScheduleMirror(input) {
      const terminal =
        input.scheduleStatus === "released" ||
        input.scheduleStatus === "canceled" ||
        input.scheduleStatus === "completed" ||
        input.scheduleStatus === "aborted";
      const patch: {
        provider_schedule_id: string;
        schedule_status: string;
        scheduled_plan_id?: string | null;
        scheduled_effective_at?: string | null;
        schedule_released_at?: string | null;
      } = {
        // Retain schedule id for audit/correlation; never write plan_id here.
        provider_schedule_id: input.providerScheduleId,
        schedule_status: input.scheduleStatus,
      };
      if (terminal) {
        // No actionable future downgrade remains — clear future-plan mirror.
        patch.scheduled_plan_id = null;
        patch.scheduled_effective_at = null;
      } else if (input.scheduledPlanId) {
        patch.scheduled_plan_id = input.scheduledPlanId;
        if (input.scheduledEffectiveAt) {
          patch.scheduled_effective_at = input.scheduledEffectiveAt;
        }
      }
      if (input.scheduleReleasedAt) {
        patch.schedule_released_at = input.scheduleReleasedAt;
      }
      const { error } = await admin
        .from("organization_subscriptions")
        .update(patch)
        .eq("organization_id", input.organizationId)
        .eq("billing_subscription_id", input.billingSubscriptionId);
      if (error) {
        console.error("Failed to sync subscription schedule:", error.message);
      }
    },

    async getInvoiceByProviderId(providerInvoiceId) {
      const { data } = await admin
        .from("billing_invoices")
        .select("id, status, metadata")
        .eq("billing_provider", "stripe")
        .eq("provider_invoice_id", providerInvoiceId)
        .maybeSingle();
      if (!data?.id) return null;
      const metadata =
        data.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
          ? (data.metadata as Record<string, unknown>)
          : {};
      return { id: String(data.id), status: String(data.status), metadata };
    },

    async notifyBillingCharge() {
      // Resend billing transaction notices hook in later phase.
      // Intentionally no-op until EMAIL_FROM_BILLING wiring is authorized.
    },

    async notifySubscriptionDunning(input) {
      const { data: organization } = await admin
        .from("organizations")
        .select("name, display_name, timezone")
        .eq("id", input.organizationId)
        .maybeSingle();
      const organizationName =
        (typeof organization?.display_name === "string" && organization.display_name.trim()) ||
        (typeof organization?.name === "string" && organization.name.trim()) ||
        "your organization";
      const { createNotification } = await import("@/lib/notifications/create-notification");
      const {
        SUBSCRIPTION_DUNNING_CHANNELS,
        SUBSCRIPTION_DUNNING_ROLES,
        subscriptionFailureDedupKey,
        subscriptionFailureNotice,
        subscriptionFinalFailureDedupKey,
        subscriptionFinalFailureNotice,
        subscriptionRecoveryDedupKey,
        subscriptionRecoveryNotice,
      } = await import("@/lib/billing/stripe/subscription-dunning");
      const notice =
        input.kind === "payment_failed" && input.invoiceId
          ? {
              ...subscriptionFailureNotice({
                organizationName,
                amountDueCents: input.amountCents,
                currency: input.currency,
                nextPaymentAttemptUnix: input.nextPaymentAttemptUnix,
                timeZone: typeof organization?.timezone === "string" ? organization.timezone : null,
              }),
              deduplicationKey: subscriptionFailureDedupKey(input.invoiceId),
              severity: "medium" as const,
            }
          : input.kind === "payment_recovered" && input.invoiceId
            ? {
                ...subscriptionRecoveryNotice({
                  organizationName,
                  amountPaidCents: input.amountCents,
                  currency: input.currency,
                }),
                deduplicationKey: subscriptionRecoveryDedupKey(input.invoiceId),
                severity: "informational" as const,
              }
            : input.kind === "final_failure" && input.subscriptionId
              ? (() => {
                  const finalNotice = subscriptionFinalFailureNotice({
                    organizationName,
                    stripeStatus: input.stripeStatus,
                  });
                  if (!finalNotice) return null;
                  return {
                    ...finalNotice,
                    deduplicationKey: subscriptionFinalFailureDedupKey(input.subscriptionId),
                    severity: "high" as const,
                  };
                })()
              : null;
      if (!notice) return;
      const created = await createNotification(
        {
          organizationId: input.organizationId,
          notificationType: notice.notificationType,
          severity: notice.severity,
          title: notice.title,
          body: notice.body,
          actionUrl: "/settings/billing",
          deduplicationKey: notice.deduplicationKey,
          recipientRoles: [...SUBSCRIPTION_DUNNING_ROLES],
          channels: [...SUBSCRIPTION_DUNNING_CHANNELS],
          requestedSenderCategory: "billing",
          metadata: { kind: input.kind },
        },
        { dispatchNow: false },
      );
      if (created.status !== "queued") return;
      const { AuditAction } = await import("@/lib/audit/actions");
      const { writeAuditLog } = await import("@/lib/audit/log");
      const action =
        input.kind === "payment_recovered"
          ? AuditAction.BILLING_SUBSCRIPTION_PAYMENT_RECOVERED
          : input.kind === "final_failure"
            ? AuditAction.BILLING_SUBSCRIPTION_PAYMENT_FINAL_FAILURE
            : AuditAction.BILLING_SUBSCRIPTION_PAYMENT_FAILED;
      await writeAuditLog(admin, {
        organizationId: input.organizationId,
        action,
        entityType: "organization",
        entityId: input.organizationId,
        metadata: {
          organization_id: input.organizationId,
          kind: input.kind,
          recipient_count: created.recipientCount,
        },
      });
    },
  };
}
