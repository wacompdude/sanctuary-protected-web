/**
 * Period-end cancellation self-check. No Stripe network and no database writes.
 * Run: npx --yes tsx lib/billing/stripe/cancellation.selfcheck.ts
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { canStartInitialSubscriptionCheckout } from "@/lib/billing/checkout-eligibility";
import { PENDING_CANCELLATION_PLAN_CHANGE_MESSAGE } from "@/lib/billing/stripe/cancellation";
import {
  assertNoClientCancellationIds,
  cancellationHistoryChange,
  formatAccessThroughDate,
  nextCancellationHistory,
  pendingCancellationCopy,
  setSubscriptionCancelAtPeriodEnd,
  TRIAL_CANCELLATION_MESSAGE,
  type CancellationStripeDeps,
  type LocalCancellationSubscription,
  type RetrievedCancellationSubscription,
} from "@/lib/billing/stripe/cancellation";
import { DOWNGRADE_CANCELLATION_CONFLICT_MESSAGE } from "@/lib/billing/stripe/downgrade";
import { scheduleSubscriptionDowngrade } from "@/lib/billing/stripe/downgrade";
import type { StripePriceSnapshot } from "@/lib/billing/stripe/catalog";
import { prepareSubscriptionUpgrade } from "@/lib/billing/stripe/upgrade";
import { handleSubscriptionLifecycle } from "@/lib/billing/stripe/webhook-sync";
import type {
  SyncedSubscriptionSnapshot,
  WebhookSyncStore,
} from "@/lib/billing/stripe/webhook-sync";
import type { StripeWebhookObjectSummary } from "@/lib/billing/stripe/webhook-verify";
import { resolveChurchEntitlementSource } from "@/lib/subscriptions/entitlement-resolution";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const PERIOD_END_ISO = "2026-11-08T08:40:14.000Z";
const PERIOD_END = Math.floor(Date.parse(PERIOD_END_ISO) / 1000);
const PERIOD_START = Math.floor(Date.parse("2026-10-08T08:40:14.000Z") / 1000);
const PRICE_ID = "price_steward";

function local(
  overrides: Partial<LocalCancellationSubscription> = {},
): LocalCancellationSubscription {
  return {
    planKey: "steward_pro",
    planDisplayName: "Steward Pro",
    billingProvider: "stripe",
    billingCustomerId: "cus_trusted",
    billingSubscriptionId: "sub_trusted",
    status: "active",
    cancelAtPeriodEnd: false,
    activeDowngradeSchedule: false,
    currentPeriodEnd: PERIOD_END_ISO,
    ...overrides,
  };
}

function live(
  overrides: Partial<RetrievedCancellationSubscription> = {},
): RetrievedCancellationSubscription {
  return {
    id: "sub_trusted",
    customerId: "cus_trusted",
    status: "active",
    cancelAtPeriodEnd: false,
    currentPeriodEnd: PERIOD_END,
    priceId: PRICE_ID,
    canceledAt: null,
    scheduleId: null,
    ...overrides,
  };
}

function fakeDeps(state: RetrievedCancellationSubscription): CancellationStripeDeps & {
  updates: { params: { cancel_at_period_end: boolean }; key: string }[];
  retrieves: number;
} {
  const updates: { params: { cancel_at_period_end: boolean }; key: string }[] = [];
  let retrieves = 0;
  return {
    updates,
    get retrieves() {
      return retrieves;
    },
    retrieveSubscription: async (subscriptionId) => {
      retrieves += 1;
      assert(subscriptionId === state.id, "server retrieves the trusted subscription id");
      return { ...state };
    },
    updateCancelAtPeriodEnd: async (subscriptionId, params, idempotencyKey) => {
      assert(subscriptionId === state.id, "update uses the trusted subscription id");
      assert(
        Object.keys(params).join(",") === "cancel_at_period_end",
        "update params are only cancel_at_period_end",
      );
      updates.push({ params, key: idempotencyKey });
      state.cancelAtPeriodEnd = params.cancel_at_period_end;
      state.canceledAt = params.cancel_at_period_end ? 1_700_000_100 : null;
      return { ...state };
    },
  };
}

function summary(
  overrides: Partial<StripeWebhookObjectSummary>,
): StripeWebhookObjectSummary {
  return {
    objectType: "subscription",
    id: "sub_trusted",
    customerId: "cus_trusted",
    subscriptionId: "sub_trusted",
    invoiceId: null,
    checkoutSessionId: null,
    priceItems: [
      {
        priceId: PRICE_ID,
        lookupKey: "steward_pro_monthly",
        productName: null,
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
      },
    ],
    priceId: PRICE_ID,
    priceLookupKey: "steward_pro_monthly",
    status: "active",
    mode: null,
    paymentStatus: null,
    amountPaid: null,
    amountDue: null,
    currency: "usd",
    hostedInvoiceUrl: null,
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
    cancelAtPeriodEnd: false,
    metadataOrganizationId: "org_test",
    metadataPlanKey: "steward_pro",
    ...overrides,
  };
}

function memoryStore(): WebhookSyncStore & {
  subscription: SyncedSubscriptionSnapshot;
  history: { changeType: string; eventId: string | null; transition: string | null }[];
  transactions: number;
  deletedOrganization: boolean;
} {
  const subscription: SyncedSubscriptionSnapshot = {
    id: "row_1",
    organizationId: "org_test",
    planId: "plan_steward",
    planKey: "steward_pro",
    status: "active" as SyncedSubscriptionSnapshot["status"],
    billingSubscriptionId: "sub_trusted",
    paymentStatus: "ok",
    cancelAtPeriodEnd: false as boolean,
    currentPeriodEnd: PERIOD_END_ISO,
  };
  const history: {
    changeType: string;
    eventId: string | null;
    transition: string | null;
  }[] = [];
  const store: WebhookSyncStore & {
    subscription: SyncedSubscriptionSnapshot;
    history: typeof history;
    transactions: number;
    deletedOrganization: boolean;
  } = {
    subscription,
    history,
    transactions: 0,
    deletedOrganization: false,
    async findOrganizationByStripeCustomerId() {
      return { organizationId: "org_test", providerCustomerId: "cus_trusted" };
    },
    async getPlanIdByKey() {
      return "plan_steward";
    },
    async getSubscriptionByProviderId() {
      return { ...subscription };
    },
    async getCurrentSubscription() {
      return subscription.status === "cancelled" ? null : { ...subscription };
    },
    async upsertSubscription(input) {
      const previousStatus = subscription.status;
      const planChanged = subscription.planId !== input.planId;
      const statusChanged = previousStatus !== input.status;
      subscription.planId = input.planId;
      subscription.planKey = input.planKey;
      subscription.status = input.status;
      subscription.cancelAtPeriodEnd = input.cancelAtPeriodEnd;
      if (input.currentPeriodEnd) subscription.currentPeriodEnd = input.currentPeriodEnd;
      return {
        subscription: { ...subscription },
        created: false,
        planChanged,
        statusChanged,
        previousPlanId: "plan_steward",
        previousStatus,
      };
    },
    async writeChangeHistory(input) {
      history.push({
        changeType: input.changeType,
        eventId:
          typeof input.metadata.stripe_event_id === "string"
            ? input.metadata.stripe_event_id
            : null,
        transition:
          typeof input.metadata.cancellation_transition === "string"
            ? input.metadata.cancellation_transition
            : null,
      });
    },
    async hasChangeHistoryForProviderEvent(providerEventId, changeType) {
      return history.some(
        (row) =>
          row.eventId === providerEventId &&
          (changeType == null || row.changeType === changeType),
      );
    },
    async hasCancellationTransition(transitionKey) {
      return history.some((row) => row.transition === transitionKey);
    },
    async upsertInvoice() {
      return { id: "in_row", created: false };
    },
    async insertTransaction() {
      store.transactions += 1;
      return { id: "txn", created: true };
    },
    async updateSubscriptionPaymentStatus() {},
    async activateTrialOrganization() {
      return "unchanged";
    },
    async syncOrganizationPlanName() {},
    async syncScheduleMirror() {},
  };
  return store;
}

async function throws(fn: () => Promise<unknown>): Promise<Error | null> {
  try {
    await fn();
    return null;
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
}

async function main() {
  const sourceRoot = join(process.cwd());
  const actionSource = readFileSync(
    join(sourceRoot, "app/(app)/settings/billing/actions.ts"),
    "utf8",
  );
  const liveSource = readFileSync(
    join(
      sourceRoot,
      "lib/billing/stripe",
      `${["cancellation", "live"].join("-")}.ts`,
    ),
    "utf8",
  );
  const panelSource = readFileSync(
    join(sourceRoot, "components/billing/billing-plan-panel.tsx"),
    "utf8",
  );
  const querySource = readFileSync(
    join(sourceRoot, "lib/subscriptions/queries.ts"),
    "utf8",
  );
  const selfSource = readFileSync(
    join(sourceRoot, "lib/billing/stripe/cancellation.selfcheck.ts"),
    "utf8",
  );

  assert(
    actionSource.includes("requireBillingManageAccess()"),
    "2 billing-manage authorization remains required",
  );
  assert(
    actionSource.includes("async function requestCancellationAction") &&
      actionSource.includes("async function keepSubscriptionAction") &&
      actionSource.includes("changePeriodEndCancellation"),
    "cancel and keep share the authorized server path",
  );
  assert(
    !actionSource.includes("formData.get(\"subscription"),
    "3 browser cannot supply a Stripe subscription id",
  );
  assert(
    actionSource.includes("billing_subscription_id") &&
      actionSource.includes("loadLocalCancellationSubscription"),
    "4 server resolves the trusted subscription id",
  );
  assert(
    liveSource.includes("subscriptions.update") && !liveSource.includes(".cancel("),
    "6 live adapter updates cancel_at_period_end and does not call subscriptions.cancel",
  );
  assert(
    !selfSource.includes(["cancellation", "live"].join("-")) &&
      !selfSource.includes(["STRIPE", "SECRET"].join("_")),
    "36 this self-check does not perform a Stripe network write",
  );

  const state = live();
  const deps = fakeDeps(state);
  const scheduled = await setSubscriptionCancelAtPeriodEnd({
    local: local(),
    cancelAtPeriodEnd: true,
    deps,
  });
  assert(scheduled.changed, "1 active paid subscription can request period-end cancellation");
  assert(deps.updates[0]?.params.cancel_at_period_end === true, "5 request uses cancel_at_period_end true");
  assert(scheduled.planKey === "steward_pro", "7 request does not change the live plan");
  assert(scheduled.priceId === PRICE_ID, "price is unchanged");
  assert(scheduled.subscriptionId === "sub_trusted", "21 same subscription id");
  assert(
    !JSON.stringify(deps.updates[0]?.params).includes("proration") &&
      !JSON.stringify(deps.updates[0]?.params).includes("invoice"),
    "9-11 no invoice, refund, or proration is requested",
  );
  assert(
    resolveChurchEntitlementSource({
      hasCurrentSubscription: true,
      latestStatus: "active",
    }) === "current",
    "8 current entitlements remain active while cancellation is pending",
  );

  const again = await setSubscriptionCancelAtPeriodEnd({
    local: local({ cancelAtPeriodEnd: true }),
    cancelAtPeriodEnd: true,
    deps,
  });
  assert(!again.changed && again.history === null, "15 duplicate cancellation request is idempotent");
  assert(deps.updates.length === 1, "15 duplicate does not write Stripe again");

  const downgradeBlocked = await throws(() =>
    scheduleSubscriptionDowngrade({
      local: {
        subscriptionRowId: "row",
        planKey: "steward_pro",
        billingProvider: "stripe",
        billingCustomerId: "cus_trusted",
        billingSubscriptionId: "sub_trusted",
        cancelAtPeriodEnd: true,
        activeDowngradeSchedule: false,
      },
      targetPlanKey: "servant_standard",
      requestedBy: null,
      deps: {
        retrieveSubscription: async () => {
          throw new Error("downgrade must not reach Stripe");
        },
        listPrices: async () => [],
        createScheduleFromSubscription: async () => {
          throw new Error("no schedule");
        },
        retrieveSchedule: async () => {
          throw new Error("no schedule");
        },
        updateSchedule: async () => {
          throw new Error("no schedule");
        },
        releaseSchedule: async () => {
          throw new Error("no schedule");
        },
        saveScheduledMirror: async () => {
          throw new Error("no mirror");
        },
        saveReleasedMirror: async () => {
          throw new Error("no mirror");
        },
      },
    }),
  );
  assert(
    downgradeBlocked?.message.includes("already scheduled"),
    "17 pending cancellation blocks scheduled downgrade",
  );

  const cancelBlocked = await throws(() =>
    setSubscriptionCancelAtPeriodEnd({
      local: local({ activeDowngradeSchedule: true }),
      cancelAtPeriodEnd: true,
      deps,
    }),
  );
  assert(
    cancelBlocked?.message === DOWNGRADE_CANCELLATION_CONFLICT_MESSAGE,
    "16 active scheduled downgrade blocks cancellation",
  );

  const upgradeBlocked = await throws(() =>
    prepareSubscriptionUpgrade({
      local: {
        planKey: "steward_pro",
        billingProvider: "stripe",
        billingCustomerId: "cus_trusted",
        billingSubscriptionId: "sub_trusted",
        cancelAtPeriodEnd: true,
      },
      targetPlanKey: "shepherd_plus",
      stripeSubscription: {
        id: "sub_trusted",
        customerId: "cus_trusted",
        status: "active",
        cancelAtPeriodEnd: true,
        items: [
          {
            id: "si_base",
            priceId: PRICE_ID,
            lookupKey: "steward_pro_monthly",
            periodStart: PERIOD_START,
            periodEnd: PERIOD_END,
          },
        ],
      },
      listPrices: async () => [
        {
          id: "price_shepherd",
          productId: "prod_shepherd",
          lookupKey: "shepherd_plus_monthly",
          unitAmount: 5995,
          currency: "usd",
          active: true,
          type: "recurring",
          recurringInterval: "month",
        } satisfies StripePriceSnapshot,
      ],
    }),
  );
  assert(
    upgradeBlocked?.message === PENDING_CANCELLATION_PLAN_CHANGE_MESSAGE,
    "18 pending cancellation blocks immediate upgrade",
  );

  const kept = await setSubscriptionCancelAtPeriodEnd({
    local: local({ cancelAtPeriodEnd: true }),
    cancelAtPeriodEnd: false,
    deps,
  });
  assert(kept.changed, "19 Keep subscription clears cancel_at_period_end");
  assert(deps.updates.at(-1)?.params.cancel_at_period_end === false, "19 uses false");
  assert(kept.planKey === "steward_pro" && kept.subscriptionId === "sub_trusted", "22 same plan and subscription");
  const keptAgain = await setSubscriptionCancelAtPeriodEnd({
    local: local({ cancelAtPeriodEnd: false }),
    cancelAtPeriodEnd: false,
    deps,
  });
  assert(!keptAgain.changed, "20 duplicate Keep subscription is idempotent");
  assert(Number(deps.updates.length) === 2, "20 duplicate keep does not write again");

  const copy = pendingCancellationCopy({
    planDisplayName: "Shepherd Plus",
    paidThroughIso: PERIOD_END_ISO,
  });
  assert(copy.title === "Subscription scheduled to cancel", "14 pending title");
  assert(
    copy.through.includes("Shepherd Plus") &&
      copy.through.includes(formatAccessThroughDate(PERIOD_END_ISO)),
    "14 pending UI displays the paid-through date and plan name",
  );
  assert(
    formatAccessThroughDate(PERIOD_END_ISO) === "November 8, 2026",
    "paid-through date formats in UTC",
  );
  assert(panelSource.includes("Keep subscription"), "24 pending UI offers Keep subscription");
  assert(
    panelSource.includes("cancellationMode !== \"paid\""),
    "32 trial cancellation control is not the paid action",
  );
  assert(panelSource.includes("TRIAL_CANCELLATION_MESSAGE"), "32 trial copy is shown");

  let trialRetrieves = 0;
  const trialError = await throws(() =>
    setSubscriptionCancelAtPeriodEnd({
      local: local({
        billingSubscriptionId: "",
        billingCustomerId: "",
        billingProvider: "stripe",
        status: "trialing",
      }),
      cancelAtPeriodEnd: true,
      deps: {
        retrieveSubscription: async () => {
          trialRetrieves += 1;
          return live();
        },
        updateCancelAtPeriodEnd: async () => live(),
      },
    }),
  );
  assert(trialError?.message === TRIAL_CANCELLATION_MESSAGE, "32 no-card trial does not call Stripe");
  assert(trialRetrieves === 0, "32 Stripe retrieve is not called for a trial");

  assertNoClientCancellationIds({});
  const clientIds = await throws(async () => {
    assertNoClientCancellationIds({ subscriptionId: "sub_browser" });
  });
  assert(clientIds != null, "3 client Stripe ids are rejected");

  const store = memoryStore();
  await handleSubscriptionLifecycle(
    store,
    summary({ cancelAtPeriodEnd: true, canceledAt: 1_700_000_100 }),
    "stripe_subscription_updated",
    { providerEventId: "evt_cancel_on" },
  );
  assert(store.subscription.cancelAtPeriodEnd === true, "13 updated mirrors true");
  assert(store.subscription.planId === "plan_steward", "13 plan stays");
  assert(store.subscription.status === "active", "13 status stays active");
  assert(
    store.history.some((row) => row.changeType === "cancellation_scheduled"),
    "33 cancellation-scheduled history",
  );
  await handleSubscriptionLifecycle(
    store,
    summary({ cancelAtPeriodEnd: true, canceledAt: 1_700_000_100 }),
    "stripe_subscription_updated",
    { providerEventId: "evt_cancel_on" },
  );
  assert(
    store.history.filter((row) => row.changeType === "cancellation_scheduled").length === 1,
    "33 cancellation-scheduled history is idempotent",
  );

  await handleSubscriptionLifecycle(
    store,
    summary({ cancelAtPeriodEnd: false, canceledAt: null }),
    "stripe_subscription_updated",
    { providerEventId: "evt_cancel_off" },
  );
  const mirrored = store.subscription as {
    cancelAtPeriodEnd?: boolean;
    status: string;
    planId: string;
  };
  assert(mirrored.cancelAtPeriodEnd === false, "23 updated mirrors false");
  assert(
    store.history.some((row) => row.changeType === "cancellation_reversed"),
    "34 cancellation-reversed history",
  );
  await handleSubscriptionLifecycle(
    store,
    summary({ cancelAtPeriodEnd: false, canceledAt: null }),
    "stripe_subscription_updated",
    { providerEventId: "evt_cancel_off" },
  );
  assert(
    store.history.filter((row) => row.changeType === "cancellation_reversed").length === 1,
    "34 cancellation-reversed history is idempotent",
  );
  assert(mirrored.cancelAtPeriodEnd === false, "24 pending flag clears after keep");

  await handleSubscriptionLifecycle(
    store,
    summary({ status: "canceled", cancelAtPeriodEnd: true }),
    "stripe_subscription_deleted",
    { providerEventId: "evt_deleted" },
  );
  assert(mirrored.status === "cancelled", "25 deleted marks cancelled");
  assert(store.subscription.planId === "plan_steward", "26 final cancellation preserves plan_id");
  assert(!store.deletedOrganization, "27 final cancellation does not delete organization data");
  assert(store.transactions === 0, "12 and 28 no financial transaction is created");
  assert(
    store.history.some((row) => row.changeType === "subscription_cancelled"),
    "35 final-cancellation history",
  );
  await handleSubscriptionLifecycle(
    store,
    summary({ status: "canceled", cancelAtPeriodEnd: true }),
    "stripe_subscription_deleted",
    { providerEventId: "evt_deleted" },
  );
  assert(
    store.history.filter((row) => row.changeType === "subscription_cancelled").length === 1,
    "35 final-cancellation history is idempotent",
  );

  assert(
    resolveChurchEntitlementSource({
      hasCurrentSubscription: false,
      latestStatus: "cancelled",
    }) === "none",
    "29 cancelled subscription does not receive the default plan",
  );
  assert(
    resolveChurchEntitlementSource({
      hasCurrentSubscription: false,
      latestStatus: "cancelled",
    }) !== "current",
    "30 cancelled subscription does not receive historical plan entitlements",
  );
  assert(
    querySource.includes("currentOnly") &&
      !querySource.includes('"cancelled"') &&
      querySource.includes("getLatestChurchSubscription"),
    "current lookup stays separate from the latest cancelled row",
  );
  assert(
    canStartInitialSubscriptionCheckout({
      isSamePlan: true,
      hasProviderSubscription: false,
      checkoutAvailable: true,
    }),
    "31 owner can start checkout when no current provider subscription exists",
  );
  assert(
    !canStartInitialSubscriptionCheckout({
      isSamePlan: false,
      hasProviderSubscription: true,
      checkoutAvailable: true,
    }),
    "a live provider subscription still does not start a second checkout",
  );

  const scheduledHistory = nextCancellationHistory({
    existingTransitions: [],
    existingEventChangeTypes: [],
    eventId: "evt_1",
    previousCancelAtPeriodEnd: false,
    nextCancelAtPeriodEnd: true,
    nextStatus: "active",
    subscriptionId: "sub_trusted",
    periodEndUnix: PERIOD_END,
    stripeCanceledAt: 10,
  });
  assert(scheduledHistory?.changeType === "cancellation_scheduled", "history decision schedules");
  assert(
    nextCancellationHistory({
      existingTransitions: [scheduledHistory?.transition ?? ""],
      existingEventChangeTypes: [],
      eventId: "evt_1",
      previousCancelAtPeriodEnd: false,
      nextCancelAtPeriodEnd: true,
      nextStatus: "active",
      subscriptionId: "sub_trusted",
      periodEndUnix: PERIOD_END,
      stripeCanceledAt: 10,
    }) === null,
    "history decision is idempotent for the same transition",
  );
  assert(
    cancellationHistoryChange({
      previousCancelAtPeriodEnd: true,
      nextCancelAtPeriodEnd: false,
      nextStatus: "cancelled",
    }) === null,
    "final cancellation does not also record a reversal",
  );

  console.log("cancellation.selfcheck ok");
}

void main();
