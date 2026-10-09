/**
 * Stripe webhook synchronization store + handlers (Phase 4B-4).
 * Injectable for self-checks — no Stripe network in tests.
 */

import {
  periodForApprovedBasePlanItem,
  resolveApprovedSubscriptionPlanFromItems,
  servicePeriodForApprovedSubscriptionLines,
  type ApprovedPlanResolution,
  type GetStripePriceById,
  type WebhookPriceItemRef,
} from "@/lib/billing/stripe/plan-correlation";
import {
  mapStripeInvoiceStatus,
  mapStripeSubscriptionStatus,
  paymentStatusForInvoice,
} from "@/lib/billing/stripe/status-map";
import {
  evaluatePostEffectiveScheduleRelease,
  scheduleMirrorStatusAfterStripeRelease,
} from "@/lib/billing/stripe/downgrade";
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
  billingCustomerId?: string | null;
  providerScheduleId?: string | null;
  scheduleStatus?: string | null;
  scheduledPlanId?: string | null;
  scheduledPlanKey?: string | null;
  scheduledEffectiveAt?: string | null;
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
  /** Display name only. Does not change organizations.status or trial state. */
  syncOrganizationPlanName(input: {
    organizationId: string;
    planKey: PlanKey;
  }): Promise<void>;
  /**
   * Schedule mirror only. Must not change plan_id, plan name, or entitlements.
   */
  syncScheduleMirror(input: {
    organizationId: string;
    billingSubscriptionId: string;
    providerScheduleId: string;
    scheduleStatus: "scheduled" | "released" | "canceled" | "completed" | "aborted";
    scheduledPlanId?: string | null;
    scheduledEffectiveAt?: string | null;
    scheduleReleasedAt?: string | null;
  }): Promise<void>;
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

export type ScheduleReleaseCall = {
  scheduleId: string;
  idempotencyKey: string;
};

export type SubscriptionLifecycleOptions = {
  providerEventId?: string | null;
  getPriceById?: GetStripePriceById;
  now?: Date;
  /**
   * Injected Stripe release. Self-checks pass a fake.
   * Absent in production only when the webhook layer did not wire cleanup.
   */
  releaseCompletedSchedule?: (
    input: ScheduleReleaseCall,
  ) => Promise<{ status: string }>;
  /** Read the schedule status after a release error. No second release. */
  confirmScheduleStatus?: (scheduleId: string) => Promise<string | null>;
  /**
   * Read the live subscription's approved base plan.
   * Used by subscription_schedule.released. Must not read future phases.
   */
  readLiveApprovedPlanKey?: (subscriptionId: string) => Promise<string | null>;
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

  await store.syncOrganizationPlanName({
    organizationId: org.organizationId,
    planKey,
  });

  if (changeType === "stripe_subscription_updated") {
    await releaseScheduleAfterLivePlanSync({
      store,
      org,
      object,
      livePlanKey: planKey,
      options,
    });
  }

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

const RELEASED_SCHEDULE_STATUSES = new Set(["released", "completed"]);

/**
 * Runs only after the live plan, history, and display name have been saved.
 * A release failure leaves that plan in place and throws so the event can retry.
 */
async function releaseScheduleAfterLivePlanSync(input: {
  store: WebhookSyncStore;
  org: OrgCustomerMapping;
  object: StripeWebhookObjectSummary;
  livePlanKey: PlanKey;
  options: SubscriptionLifecycleOptions;
}): Promise<void> {
  if (!input.object.subscriptionId) return;
  const row = await input.store.getSubscriptionByProviderId(input.object.subscriptionId);
  if (!row) return;
  const decision = evaluatePostEffectiveScheduleRelease({
    now: input.options.now ?? new Date(),
    organizationId: input.org.organizationId,
    livePlanKey: input.livePlanKey,
    liveCustomerId: input.object.customerId ?? "",
    liveSubscriptionId: input.object.subscriptionId,
    liveScheduleId: input.object.scheduleId ?? null,
    mirrorOrganizationId: row.organizationId,
    mirrorCustomerId: row.billingCustomerId ?? "",
    mirrorSubscriptionId: row.billingSubscriptionId ?? "",
    scheduleStatus: row.scheduleStatus ?? null,
    providerScheduleId: row.providerScheduleId ?? null,
    scheduledPlanKey: row.scheduledPlanKey ?? null,
    scheduledEffectiveAt: row.scheduledEffectiveAt ?? null,
  });
  if (!decision.eligible) return;
  if (!input.options.releaseCompletedSchedule) {
    throw new Error("Subscription schedule release failed.");
  }

  let status = "";
  try {
    const released = await input.options.releaseCompletedSchedule({
      scheduleId: decision.scheduleId,
      idempotencyKey: decision.idempotencyKey,
    });
    status = released.status;
  } catch {
    status = "";
  }
  if (!RELEASED_SCHEDULE_STATUSES.has(status)) {
    const confirmed = input.options.confirmScheduleStatus
      ? await input.options.confirmScheduleStatus(decision.scheduleId).catch(() => null)
      : null;
    if (!confirmed || !RELEASED_SCHEDULE_STATUSES.has(confirmed)) {
      throw new Error("Subscription schedule release failed.");
    }
    status = confirmed;
  }

  await input.store.syncScheduleMirror({
    organizationId: input.org.organizationId,
    billingSubscriptionId: input.object.subscriptionId,
    providerScheduleId: decision.scheduleId,
    scheduleStatus: "completed",
    scheduleReleasedAt: (input.options.now ?? new Date()).toISOString(),
  });
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
  const planResolution = await resolveApprovedSubscriptionPlanFromItems(
    priceItems,
    { getPriceById: options.getPriceById },
  );
  const sharedPeriod = await servicePeriodForApprovedSubscriptionLines(
    priceItems,
    options.getPriceById,
  );
  const periodStart = unixToIso(sharedPeriod?.periodStart ?? null);
  const periodEnd = unixToIso(sharedPeriod?.periodEnd ?? null);

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
  const sharedPeriod = await servicePeriodForApprovedSubscriptionLines(
    priceItems,
    options.getPriceById,
  );
  const periodStart = unixToIso(sharedPeriod?.periodStart ?? null);
  const periodEnd = unixToIso(sharedPeriod?.periodEnd ?? null);

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

/**
 * Subscription schedule events update the schedule mirror only.
 * Future phases are not the live plan.
 * subscription_schedule.released never calls Stripe release.
 */
export async function handleSubscriptionSchedule(
  store: WebhookSyncStore,
  object: StripeWebhookObjectSummary,
  options: SubscriptionLifecycleOptions = {},
): Promise<WebhookHandlerResult> {
  const scheduleStatus = mapScheduleMirrorStatus(object.status);
  if (!scheduleStatus) {
    return {
      outcome: "ignored",
      detail: "Subscription schedule status is not mirrored.",
      organizationId: null,
      metadata: { stripe_schedule_status: object.status },
    };
  }
  if (!object.id || !object.subscriptionId) {
    return {
      outcome: "ignored",
      detail: "Subscription schedule is missing its subscription.",
      organizationId: null,
      metadata: {},
    };
  }

  let org: OrgCustomerMapping;
  try {
    org = await resolveOrganizationForStripeObject(store, object);
  } catch (error) {
    if (error instanceof StripeWebhookCorrelationError) {
      return ignoreCorrelation(error, { stripe_schedule_id: object.id });
    }
    throw error;
  }

  const subscription = await store.getSubscriptionByProviderId(object.subscriptionId);
  if (!subscription || subscription.organizationId !== org.organizationId) {
    return {
      outcome: "ignored",
      detail: "Subscription schedule does not match a local subscription.",
      organizationId: org.organizationId,
      metadata: { stripe_schedule_id: object.id },
    };
  }

  const future = futureSchedulePhase(object.schedulePhases ?? []);
  let scheduledPlanId: string | null = null;
  let scheduledEffectiveAt: string | null = null;
  if (scheduleStatus === "scheduled" && future) {
    const resolution = await resolveApprovedSubscriptionPlanFromItems(future.items, {
      getPriceById: options.getPriceById,
    });
    if (resolution.ok) {
      scheduledPlanId = await store.getPlanIdByKey(resolution.planKey);
      scheduledEffectiveAt = unixToIso(future.startDate);
    }
  }

  if (scheduleStatus === "scheduled" && (!scheduledPlanId || !scheduledEffectiveAt)) {
    return {
      outcome: "ignored",
      detail: "Subscription schedule future phase was not an approved base plan.",
      organizationId: org.organizationId,
      metadata: { stripe_schedule_id: object.id, live_plan_unchanged: true },
    };
  }

  let mirrorStatus = scheduleStatus;
  if (scheduleStatus === "released") {
    if (!options.readLiveApprovedPlanKey) {
      throw new Error("Subscription schedule release state could not be confirmed.");
    }
    const livePlanKey = await options.readLiveApprovedPlanKey(object.subscriptionId);
    if (!livePlanKey) {
      throw new Error("Subscription schedule release state could not be confirmed.");
    }
    mirrorStatus = scheduleMirrorStatusAfterStripeRelease({
      livePlanKey,
      scheduledPlanKey: subscription.scheduledPlanKey ?? null,
      scheduledEffectiveAt: subscription.scheduledEffectiveAt ?? null,
      now: options.now ?? new Date(),
    });
  }

  await store.syncScheduleMirror({
    organizationId: org.organizationId,
    billingSubscriptionId: object.subscriptionId,
    providerScheduleId: object.id,
    scheduleStatus: mirrorStatus,
    scheduledPlanId,
    scheduledEffectiveAt,
    scheduleReleasedAt:
      mirrorStatus === "released" || mirrorStatus === "completed"
        ? (options.now ?? new Date()).toISOString()
        : null,
  });

  return {
    outcome: "processed",
    detail: `Subscription schedule ${mirrorStatus}.`,
    organizationId: org.organizationId,
    metadata: {
      stripe_schedule_id: object.id,
      schedule_status: mirrorStatus,
      live_plan_unchanged: true,
    },
  };
}

function mapScheduleMirrorStatus(
  status: string | null,
): "scheduled" | "released" | "canceled" | "completed" | "aborted" | null {
  switch ((status ?? "").trim()) {
    case "active":
    case "not_started":
      return "scheduled";
    case "released":
      return "released";
    case "canceled":
      return "canceled";
    case "completed":
      return "completed";
    case "aborted":
      return "aborted";
    default:
      return null;
  }
}

function futureSchedulePhase(
  phases: NonNullable<StripeWebhookObjectSummary["schedulePhases"]>,
): NonNullable<StripeWebhookObjectSummary["schedulePhases"]>[number] | null {
  const withEnd = phases.filter((phase) => phase.endDate != null);
  for (const phase of withEnd) {
    const next = phases.find((candidate) => candidate.startDate === phase.endDate);
    if (next) return next;
  }
  return null;
}
