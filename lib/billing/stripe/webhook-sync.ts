/**
 * Stripe webhook synchronization store + handlers (Phase 4B-4).
 * Injectable for self-checks — no Stripe network in tests.
 */

import {
  periodForApprovedBasePlanItem,
  resolveApprovedSubscriptionPlanFromItems,
  type ApprovedPlanResolution,
  type GetStripePriceById,
  type WebhookPriceItemRef,
} from "@/lib/billing/stripe/plan-correlation";
import {
  mapStripeInvoiceStatus,
  mapStripeSubscriptionStatus,
  paymentStatusForInvoice,
} from "@/lib/billing/stripe/status-map";
import type { StripeWebhookObjectSummary } from "@/lib/billing/stripe/webhook-verify";
import type { ChurchSubscriptionStatus } from "@/lib/subscriptions/types";
import { isPlanKey, type PlanKey } from "@/lib/subscriptions/plan-keys";
import { subscriptionGrantsAccess } from "@/lib/subscriptions/status";

export type OrgCustomerMapping = {
  organizationId: string;
  providerCustomerId: string;
};

export type SyncedSubscriptionSnapshot = {
  id: string;
  organizationId: string;
  planId: string;
  planKey: string;
  status: ChurchSubscriptionStatus;
  billingSubscriptionId: string | null;
  paymentStatus: string | null;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
};

export type TrialActivationResult = "activated" | "noop" | "unchanged";

export type WebhookSyncStore = {
  findOrganizationByStripeCustomerId(
    customerId: string,
  ): Promise<OrgCustomerMapping | null>;
  getPlanIdByKey(planKey: PlanKey): Promise<string | null>;
  getSubscriptionByProviderId(
    providerSubscriptionId: string,
  ): Promise<SyncedSubscriptionSnapshot | null>;
  getCurrentSubscription(
    organizationId: string,
  ): Promise<SyncedSubscriptionSnapshot | null>;
  upsertSubscription(input: {
    organizationId: string;
    planId: string;
    planKey: PlanKey;
    status: ChurchSubscriptionStatus;
    billingCustomerId: string;
    billingSubscriptionId: string;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    cancelledAt: string | null;
    paymentStatus?: string | null;
    providerLatestInvoiceId?: string | null;
  }): Promise<{
    subscription: SyncedSubscriptionSnapshot;
    created: boolean;
    planChanged: boolean;
    statusChanged: boolean;
    previousPlanId: string | null;
    previousStatus: ChurchSubscriptionStatus | null;
  }>;
  writeChangeHistory(input: {
    organizationId: string;
    subscriptionId: string;
    oldPlanId: string | null;
    newPlanId: string;
    oldStatus: ChurchSubscriptionStatus | null;
    newStatus: ChurchSubscriptionStatus;
    changeType: string;
    reason: string;
    metadata: Record<string, unknown>;
  }): Promise<void>;
  /** App-level history idempotency keyed by Stripe event id (no migration). */
  hasChangeHistoryForProviderEvent(
    providerEventId: string,
  ): Promise<boolean>;
  upsertInvoice(input: {
    organizationId: string;
    providerInvoiceId: string;
    status: string;
    currency: string;
    totalCents: number;
    amountPaidCents: number;
    amountDueCents: number;
    periodStart: string | null;
    periodEnd: string | null;
    hostedInvoiceUrl: string | null;
    metadata: Record<string, unknown>;
  }): Promise<{ id: string; created: boolean }>;
  insertTransaction(input: {
    organizationId: string;
    invoiceId: string | null;
    transactionType: "payment" | "failed_payment";
    status: "succeeded" | "failed";
    currency: string;
    amountCents: number;
    providerInvoiceId: string;
    idempotencyKey: string;
    description: string;
    metadata: Record<string, unknown>;
  }): Promise<{ id: string; created: boolean }>;
  updateSubscriptionPaymentStatus(input: {
    organizationId: string;
    billingSubscriptionId: string | null;
    paymentStatus: string;
    providerLatestInvoiceId?: string | null;
  }): Promise<void>;
  /**
   * trial → active only. Already active is a no-op.
   * suspended and closed stay unchanged.
   */
  activateTrialOrganization(
    organizationId: string,
  ): Promise<TrialActivationResult>;
  /** Optional billing notice hook — must be idempotent; tests use no-op. */
  notifyBillingCharge?(input: {
    organizationId: string;
    providerInvoiceId: string;
    amountCents: number;
    currency: string;
  }): Promise<void>;
};

export type WebhookHandlerResult = {
  outcome: "processed" | "ignored";
  detail: string;
  organizationId: string | null;
  metadata: Record<string, unknown>;
};

/** Permanent correlation problems — acknowledge without Stripe retry loops. */
export class StripeWebhookCorrelationError extends Error {
  readonly organizationId: string | null;
  constructor(message: string, organizationId: string | null = null) {
    super(message);
    this.name = "StripeWebhookCorrelationError";
    this.organizationId = organizationId;
  }
}

function unixToIso(seconds: number | null): string | null {
  if (seconds === null || !Number.isFinite(seconds)) return null;
  return new Date(seconds * 1000).toISOString();
}

async function resolveBasePlanServicePeriod(
  items: WebhookPriceItemRef[],
  getPriceById?: GetStripePriceById,
): Promise<{
  resolution: ApprovedPlanResolution;
  periodStart: string | null;
  periodEnd: string | null;
}> {
  const resolution = await resolveApprovedSubscriptionPlanFromItems(items, {
    getPriceById,
  });
  if (!resolution.ok) {
    return { resolution, periodStart: null, periodEnd: null };
  }
  const period = periodForApprovedBasePlanItem(items, resolution);
  return {
    resolution,
    periodStart: unixToIso(period?.periodStart ?? null),
    periodEnd: unixToIso(period?.periodEnd ?? null),
  };
}

export async function resolveOrganizationForStripeObject(
  store: WebhookSyncStore,
  object: StripeWebhookObjectSummary,
): Promise<OrgCustomerMapping> {
  if (!object.customerId) {
    throw new StripeWebhookCorrelationError(
      "Stripe event is missing customer correlation.",
    );
  }
  const mapped = await store.findOrganizationByStripeCustomerId(
    object.customerId,
  );
  if (!mapped) {
    throw new StripeWebhookCorrelationError(
      "No organization mapping found for Stripe Customer.",
    );
  }

  const metaOrg = object.metadataOrganizationId;
  if (metaOrg && metaOrg !== mapped.organizationId) {
    throw new StripeWebhookCorrelationError(
      "Stripe metadata organization_id conflicts with Customer mapping.",
      mapped.organizationId,
    );
  }

  return mapped;
}

function ignoreCorrelation(
  error: StripeWebhookCorrelationError,
  extra: Record<string, unknown> = {},
): WebhookHandlerResult {
  return {
    outcome: "ignored",
    detail: error.message,
    organizationId: error.organizationId,
    metadata: {
      correlation_rejected: true,
      ...extra,
    },
  };
}

export async function handleCheckoutSessionCompleted(
  store: WebhookSyncStore,
  object: StripeWebhookObjectSummary,
): Promise<WebhookHandlerResult> {
  let org: OrgCustomerMapping;
  try {
    org = await resolveOrganizationForStripeObject(store, object);
  } catch (error) {
    if (error instanceof StripeWebhookCorrelationError) {
      return ignoreCorrelation(error, {
        checkout_session_id: object.checkoutSessionId,
        authoritative_activation: false,
      });
    }
    throw error;
  }
  // Correlation only — Checkout completed is NOT authoritative paid activation.
  return {
    outcome: "processed",
    detail:
      "Checkout session correlated; subscription/invoice events remain authoritative for entitlement.",
    organizationId: org.organizationId,
    metadata: {
      checkout_session_id: object.checkoutSessionId,
      stripe_customer_id: object.customerId,
      stripe_subscription_id: object.subscriptionId,
      checkout_mode: object.mode,
      checkout_payment_status: object.paymentStatus,
      authoritative_activation: false,
    },
  };
}

export type SubscriptionLifecycleOptions = {
  providerEventId?: string | null;
  getPriceById?: GetStripePriceById;
};

export async function handleSubscriptionLifecycle(
  store: WebhookSyncStore,
  object: StripeWebhookObjectSummary,
  changeType: string,
  options: SubscriptionLifecycleOptions = {},
): Promise<WebhookHandlerResult> {
  let org: OrgCustomerMapping;
  try {
    org = await resolveOrganizationForStripeObject(store, object);
  } catch (error) {
    if (error instanceof StripeWebhookCorrelationError) {
      return ignoreCorrelation(error, {
        stripe_subscription_id: object.subscriptionId,
      });
    }
    throw error;
  }
  if (!object.subscriptionId) {
    throw new Error("Subscription event missing subscription id.");
  }
  if (!object.status) {
    throw new Error("Subscription event missing status.");
  }

  const status = mapStripeSubscriptionStatus(object.status);
  const cancelledAt =
    status === "cancelled" ? new Date().toISOString() : null;

  const priceItems =
    object.priceItems?.length > 0
      ? object.priceItems
      : [
          {
            priceId: object.priceId,
            lookupKey: object.priceLookupKey,
            productName: null,
          },
        ];

  const {
    resolution: planResolution,
    periodStart,
    periodEnd,
  } = await resolveBasePlanServicePeriod(priceItems, options.getPriceById);

  const existingByProvider = await store.getSubscriptionByProviderId(
    object.subscriptionId,
  );

  // Cancellation/deletion can update status without a fresh approved Price.
  if (!planResolution.ok) {
    if (
      status === "cancelled" &&
      existingByProvider &&
      isPlanKey(existingByProvider.planKey)
    ) {
      const result = await store.upsertSubscription({
        organizationId: org.organizationId,
        planId: existingByProvider.planId,
        planKey: existingByProvider.planKey,
        status,
        billingCustomerId: org.providerCustomerId,
        billingSubscriptionId: object.subscriptionId,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: Boolean(object.cancelAtPeriodEnd),
        cancelledAt,
      });
      await maybeWriteHistory(store, {
        providerEventId: options.providerEventId,
        shouldWrite: result.statusChanged || result.created,
        organizationId: org.organizationId,
        subscriptionId: result.subscription.id,
        oldPlanId: result.previousPlanId,
        newPlanId: existingByProvider.planId,
        oldStatus: result.previousStatus,
        newStatus: status,
        changeType,
        planKey: existingByProvider.planKey,
        object,
      });
      return {
        outcome: "processed",
        detail: `Subscription cancelled (plan unchanged; price correlation: ${planResolution.code}).`,
        organizationId: org.organizationId,
        metadata: {
          stripe_subscription_id: object.subscriptionId,
          status,
          plan_resolution: planResolution.code,
          cancelled_without_price_revalidation: true,
        },
      };
    }

    return {
      outcome: "ignored",
      detail: planResolution.reason,
      organizationId: org.organizationId,
      metadata: {
        stripe_subscription_id: object.subscriptionId,
        price_items: priceItems.map((item) => ({
          price_id: item.priceId,
          lookup_key: item.lookupKey,
        })),
        plan_resolution: planResolution.code,
        rejected: true,
      },
    };
  }

  const planKey = planResolution.planKey;
  const planId = await store.getPlanIdByKey(planKey);
  if (!planId) {
    throw new Error(`subscription_plans missing plan_key=${planKey}`);
  }

  const result = await store.upsertSubscription({
    organizationId: org.organizationId,
    planId,
    planKey,
    status,
    billingCustomerId: org.providerCustomerId,
    billingSubscriptionId: object.subscriptionId,
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd: Boolean(object.cancelAtPeriodEnd),
    cancelledAt,
  });

  await maybeWriteHistory(store, {
    providerEventId: options.providerEventId,
    shouldWrite: result.planChanged || result.statusChanged || result.created,
    organizationId: org.organizationId,
    subscriptionId: result.subscription.id,
    oldPlanId: result.previousPlanId,
    newPlanId: planId,
    oldStatus: result.previousStatus,
    newStatus: status,
    changeType,
    planKey,
    object,
  });

  return {
    outcome: "processed",
    detail: `Subscription synchronized (${status}/${planKey}).`,
    organizationId: org.organizationId,
    metadata: {
      stripe_subscription_id: object.subscriptionId,
      plan_key: planKey,
      plan_source: planResolution.source,
      status,
      created: result.created,
      plan_changed: result.planChanged,
      status_changed: result.statusChanged,
    },
  };
}

async function maybeWriteHistory(
  store: WebhookSyncStore,
  input: {
    providerEventId?: string | null;
    shouldWrite: boolean;
    organizationId: string;
    subscriptionId: string;
    oldPlanId: string | null;
    newPlanId: string;
    oldStatus: ChurchSubscriptionStatus | null;
    newStatus: ChurchSubscriptionStatus;
    changeType: string;
    planKey: string;
    object: StripeWebhookObjectSummary;
  },
): Promise<void> {
  if (!input.shouldWrite) return;
  const eventId = input.providerEventId?.trim() || null;
  if (eventId && (await store.hasChangeHistoryForProviderEvent(eventId))) {
    return;
  }
  await store.writeChangeHistory({
    organizationId: input.organizationId,
    subscriptionId: input.subscriptionId,
    oldPlanId: input.oldPlanId,
    newPlanId: input.newPlanId,
    oldStatus: input.oldStatus,
    newStatus: input.newStatus,
    changeType: input.changeType,
    reason: `Stripe webhook ${input.changeType}`,
    metadata: {
      stripe_subscription_id: input.object.subscriptionId,
      stripe_customer_id: input.object.customerId,
      plan_key: input.planKey,
      ...(eventId ? { stripe_event_id: eventId } : {}),
    },
  });
}

export async function handleInvoicePaid(
  store: WebhookSyncStore,
  object: StripeWebhookObjectSummary,
  options: SubscriptionLifecycleOptions = {},
): Promise<WebhookHandlerResult> {
  let org: OrgCustomerMapping;
  try {
    org = await resolveOrganizationForStripeObject(store, object);
  } catch (error) {
    if (error instanceof StripeWebhookCorrelationError) {
      return ignoreCorrelation(error, {
        stripe_invoice_id: object.invoiceId,
      });
    }
    throw error;
  }
  if (!object.invoiceId) {
    throw new Error("invoice.paid missing invoice id.");
  }

  const invoiceStatus = mapStripeInvoiceStatus(object.status ?? "paid");
  const currency = (object.currency ?? "usd").toUpperCase();
  const total = Math.max(0, object.amountPaid ?? object.amountDue ?? 0);
  const priceItems =
    object.priceItems?.length > 0
      ? object.priceItems
      : [
          {
            priceId: object.priceId,
            lookupKey: object.priceLookupKey,
            productName: null,
          },
        ];
  const {
    resolution: planResolution,
    periodStart,
    periodEnd,
  } = await resolveBasePlanServicePeriod(priceItems, options.getPriceById);

  const invoice = await store.upsertInvoice({
    organizationId: org.organizationId,
    providerInvoiceId: object.invoiceId,
    status: invoiceStatus,
    currency,
    totalCents: total,
    amountPaidCents: Math.max(0, object.amountPaid ?? total),
    amountDueCents: Math.max(0, object.amountDue ?? 0),
    periodStart,
    periodEnd,
    hostedInvoiceUrl: object.hostedInvoiceUrl,
    metadata: {
      stripe_subscription_id: object.subscriptionId,
      stripe_customer_id: object.customerId,
    },
  });

  const txn = await store.insertTransaction({
    organizationId: org.organizationId,
    invoiceId: invoice.id,
    transactionType: "payment",
    status: "succeeded",
    currency,
    amountCents: Math.max(0, object.amountPaid ?? total),
    providerInvoiceId: object.invoiceId,
    idempotencyKey: `stripe_invoice_paid_${object.invoiceId}`,
    description: "Stripe invoice paid",
    metadata: {
      stripe_invoice_id: object.invoiceId,
      stripe_subscription_id: object.subscriptionId,
    },
  });

  await store.updateSubscriptionPaymentStatus({
    organizationId: org.organizationId,
    billingSubscriptionId: object.subscriptionId,
    paymentStatus: paymentStatusForInvoice(invoiceStatus),
    providerLatestInvoiceId: object.invoiceId,
  });

  if (txn.created && store.notifyBillingCharge) {
    await store.notifyBillingCharge({
      organizationId: org.organizationId,
      providerInvoiceId: object.invoiceId,
      amountCents: Math.max(0, object.amountPaid ?? total),
      currency,
    });
  }

  let organizationActivation: TrialActivationResult | "skipped" = "skipped";
  if (planResolution.ok) {
    const linked = object.subscriptionId
      ? await store.getSubscriptionByProviderId(object.subscriptionId)
      : await store.getCurrentSubscription(org.organizationId);
    if (linked && subscriptionGrantsAccess(linked.status)) {
      organizationActivation = await store.activateTrialOrganization(
        org.organizationId,
      );
    }
  }

  return {
    outcome: "processed",
    detail: "Invoice paid synchronized.",
    organizationId: org.organizationId,
    metadata: {
      stripe_invoice_id: object.invoiceId,
      invoice_row_created: invoice.created,
      transaction_created: txn.created,
      organization_activation: organizationActivation,
      base_plan_resolved: planResolution.ok,
    },
  };
}

export async function handleInvoicePaymentFailed(
  store: WebhookSyncStore,
  object: StripeWebhookObjectSummary,
  options: SubscriptionLifecycleOptions = {},
): Promise<WebhookHandlerResult> {
  let org: OrgCustomerMapping;
  try {
    org = await resolveOrganizationForStripeObject(store, object);
  } catch (error) {
    if (error instanceof StripeWebhookCorrelationError) {
      return ignoreCorrelation(error, {
        stripe_invoice_id: object.invoiceId,
      });
    }
    throw error;
  }
  if (!object.invoiceId) {
    throw new Error("invoice.payment_failed missing invoice id.");
  }

  const currency = (object.currency ?? "usd").toUpperCase();
  const due = Math.max(0, object.amountDue ?? 0);
  const priceItems =
    object.priceItems?.length > 0
      ? object.priceItems
      : [
          {
            priceId: object.priceId,
            lookupKey: object.priceLookupKey,
            productName: null,
          },
        ];
  const { periodStart, periodEnd } = await resolveBasePlanServicePeriod(
    priceItems,
    options.getPriceById,
  );

  const invoice = await store.upsertInvoice({
    organizationId: org.organizationId,
    providerInvoiceId: object.invoiceId,
    status: "open",
    currency,
    totalCents: due,
    amountPaidCents: Math.max(0, object.amountPaid ?? 0),
    amountDueCents: due,
    periodStart,
    periodEnd,
    hostedInvoiceUrl: object.hostedInvoiceUrl,
    metadata: {
      stripe_subscription_id: object.subscriptionId,
      failure: true,
    },
  });

  const txn = await store.insertTransaction({
    organizationId: org.organizationId,
    invoiceId: invoice.id,
    transactionType: "failed_payment",
    status: "failed",
    currency,
    amountCents: due,
    providerInvoiceId: object.invoiceId,
    idempotencyKey: `stripe_invoice_failed_${object.invoiceId}`,
    description: "Stripe invoice payment failed",
    metadata: {
      stripe_invoice_id: object.invoiceId,
    },
  });

  await store.updateSubscriptionPaymentStatus({
    organizationId: org.organizationId,
    billingSubscriptionId: object.subscriptionId,
    paymentStatus: "failed",
    providerLatestInvoiceId: object.invoiceId,
  });

  return {
    outcome: "processed",
    detail: "Invoice payment failure synchronized.",
    organizationId: org.organizationId,
    metadata: {
      stripe_invoice_id: object.invoiceId,
      invoice_row_created: invoice.created,
      transaction_created: txn.created,
    },
  };
}
