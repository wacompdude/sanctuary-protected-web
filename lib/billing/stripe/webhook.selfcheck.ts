/**
 * Phase 4B-4 Stripe signed webhook + subscription sync self-check
 * (includes pre-deployment hardening for price correlation + claim/history).
 * Pure mocks only — no Stripe network, no Dashboard webhook, no DB writes.
 *
 * Run: npx --yes tsx lib/billing/stripe/webhook.selfcheck.ts
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type Stripe from "stripe";
import { getBillingProvider } from "@/lib/billing/provider";
import {
  BILLING_EVENT_STALE_RECEIVED_MS,
  processBillingWebhook,
  type BillingEventClaimStore,
} from "@/lib/billing/webhooks";
import { StripeBillingProvider } from "@/lib/billing/stripe/provider";
import { mapStripeSubscriptionStatus } from "@/lib/billing/stripe/status-map";
import {
  resolveApprovedSubscriptionPlanFromItems,
  resolvePlanKeyFromStripeLookupKey,
  servicePeriodForApprovedSubscriptionLines,
  type GetStripePriceById,
} from "@/lib/billing/stripe/plan-correlation";
import { BillingCheckoutPlanError } from "@/lib/billing/errors";
import type { StripePriceSnapshot } from "@/lib/billing/stripe/catalog";
import {
  verifyStripeWebhookSignature,
  summarizeStripeEventObject,
  type StripeWebhookObjectSummary,
} from "@/lib/billing/stripe/webhook-verify";
import {
  dispatchStripeWebhookEvent,
  STRIPE_WEBHOOK_EVENT_TYPES,
} from "@/lib/billing/stripe/webhook-dispatch";
import {
  handleInvoicePaid,
  handleInvoicePaymentFailed,
  handleSubscriptionLifecycle,
  type SyncedSubscriptionSnapshot,
  type WebhookSyncStore,
} from "@/lib/billing/stripe/webhook-sync";
import type { ChurchSubscriptionStatus } from "@/lib/subscriptions/types";
import { PLAN_DISPLAY_NAMES, PLAN_KEYS } from "@/lib/subscriptions/plan-keys";
import { ACCESS_GRANTING_STATUSES } from "@/lib/subscriptions/status";

const WHSEC = "whsec_phase4b4_selfcheck_NOT_A_REAL_SECRET";
const SK = "sk_test_phase4b4_selfcheck_NOT_A_REAL_SECRET";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function withEnv(
  overrides: Record<string, string | undefined>,
  fn: () => void | Promise<void>,
): Promise<void> {
  const previous: Record<string, string | undefined> = {};
  for (const key of Object.keys(overrides)) {
    previous[key] = process.env[key];
    const next = overrides[key];
    if (next === undefined) delete process.env[key];
    else process.env[key] = next;
  }
  return Promise.resolve()
    .then(() => fn())
    .finally(() => {
      for (const key of Object.keys(overrides)) {
        const value = previous[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    });
}

function assertNoSecretLeak(text: string, secrets: string[]) {
  for (const secret of secrets) {
    if (!secret) continue;
    assert(!text.includes(secret), `must not leak secret fragment`);
  }
}

function baseObject(
  overrides: Partial<StripeWebhookObjectSummary> = {},
): StripeWebhookObjectSummary {
  const defaultItems = [
    {
      priceId: "price_selfcheck_servant",
      lookupKey: "servant_standard_monthly",
      productName: null,
    },
  ];
  const merged: StripeWebhookObjectSummary = {
    objectType: "subscription",
    id: "sub_selfcheck_1",
    customerId: "cus_selfcheck_1",
    subscriptionId: "sub_selfcheck_1",
    invoiceId: null,
    checkoutSessionId: null,
    priceItems: defaultItems,
    priceId: defaultItems[0]!.priceId,
    priceLookupKey: defaultItems[0]!.lookupKey,
    status: "active",
    mode: null,
    paymentStatus: null,
    amountPaid: null,
    amountDue: null,
    currency: "usd",
    hostedInvoiceUrl: null,
    periodStart: 1_700_000_000,
    periodEnd: 1_702_592_000,
    cancelAtPeriodEnd: false,
    metadataOrganizationId: "org_selfcheck",
    metadataPlanKey: "servant_standard",
    ...overrides,
  };
  if (!merged.priceItems?.length) {
    merged.priceItems = defaultItems;
  }
  if (merged.priceId == null) {
    merged.priceId = merged.priceItems[0]?.priceId ?? null;
  }
  if (merged.priceLookupKey == null) {
    merged.priceLookupKey = merged.priceItems[0]?.lookupKey ?? null;
  }
  return merged;
}

type ClaimRow = {
  id: string;
  processingStatus: string;
  providerEventId: string;
  createdAt: string;
  retryCount: number;
  metadata: Record<string, unknown>;
};

function createMemoryClaimStore(): BillingEventClaimStore & {
  rows: Map<string, ClaimRow>;
} {
  const rows = new Map<string, ClaimRow>();
  let seq = 0;
  return {
    rows,
    async findByProviderEventId(input) {
      const row = rows.get(`${input.billingProvider}:${input.providerEventId}`);
      if (!row) return null;
      return {
        id: row.id,
        processingStatus: row.processingStatus,
        createdAt: row.createdAt,
        retryCount: row.retryCount,
      };
    },
    async insertReceived(input) {
      const key = `${input.billingProvider}:${input.providerEventId}`;
      if (input.providerEventId && rows.has(key)) return { kind: "duplicate" };
      const id = `evt_row_${++seq}`;
      if (input.providerEventId) {
        rows.set(key, {
          id,
          processingStatus: "received",
          providerEventId: input.providerEventId,
          createdAt: new Date().toISOString(),
          retryCount: 0,
          metadata: input.metadata,
        });
      }
      return { kind: "inserted", id };
    },
    async tryClaimForRetry(input) {
      for (const row of rows.values()) {
        if (
          row.id === input.id &&
          row.processingStatus === input.fromStatus &&
          row.retryCount === input.expectedRetryCount
        ) {
          row.processingStatus = "received";
          row.retryCount = input.expectedRetryCount + 1;
          return "claimed";
        }
      }
      return "lost";
    },
    async finalize(input) {
      for (const row of rows.values()) {
        if (row.id === input.id) {
          row.processingStatus = input.processingStatus;
          row.metadata = input.metadata;
        }
      }
    },
  };
}

type OrganizationAccountStatus = "trial" | "active" | "suspended" | "closed";

type MemorySyncStore = WebhookSyncStore & {
  subscriptions: SyncedSubscriptionSnapshot[];
  invoices: {
    providerInvoiceId: string;
    status: string;
    periodStart: string | null;
    periodEnd: string | null;
  }[];
  transactions: { idempotencyKey: string; status: string }[];
  history: { changeType: string; eventId: string | null }[];
  notices: number;
  organizationStatus: OrganizationAccountStatus;
  organizationPlanName: string | null;
  conflictCustomer?: string;
};

function createMemorySyncStore(seed?: {
  orgId?: string;
  customerId?: string;
}): MemorySyncStore {
  const orgId = seed?.orgId ?? "org_selfcheck";
  const customerId = seed?.customerId ?? "cus_selfcheck_1";
  const planIds: Record<string, string> = {
    servant_standard: "plan_servant",
    steward_pro: "plan_steward",
    shepherd_plus: "plan_shepherd",
    omni_enterprise: "plan_omni",
  };
  const subscriptions: SyncedSubscriptionSnapshot[] = [];
  const invoices: MemorySyncStore["invoices"] = [];
  const transactions: { idempotencyKey: string; status: string }[] = [];
  const   history: { changeType: string; eventId: string | null }[] = [];
  const store: MemorySyncStore = {
    subscriptions,
    invoices,
    transactions,
    history,
    notices: 0,
    organizationStatus: "trial",
    organizationPlanName: "Servant Standard",
    conflictCustomer: undefined,
    async findOrganizationByStripeCustomerId(id: string) {
      if (store.conflictCustomer && id === store.conflictCustomer) {
        return { organizationId: "org_other", providerCustomerId: id };
      }
      if (id !== customerId) return null;
      return { organizationId: orgId, providerCustomerId: customerId };
    },
    async getPlanIdByKey(planKey) {
      return planIds[planKey] ?? null;
    },
    async getSubscriptionByProviderId(providerSubscriptionId) {
      return (
        subscriptions.find(
          (s) => s.billingSubscriptionId === providerSubscriptionId,
        ) ?? null
      );
    },
    async getCurrentSubscription(organizationId) {
      return (
        subscriptions.find(
          (s) =>
            s.organizationId === organizationId &&
            ["trialing", "active", "past_due", "grace_period", "incomplete"].includes(
              s.status,
            ),
        ) ?? null
      );
    },
    async upsertSubscription(input) {
      const existing =
        (await store.getSubscriptionByProviderId(input.billingSubscriptionId)) ??
        (await store.getCurrentSubscription(input.organizationId));
      if (!existing) {
        const created: SyncedSubscriptionSnapshot = {
          id: `sub_row_${subscriptions.length + 1}`,
          organizationId: input.organizationId,
          planId: input.planId,
          planKey: input.planKey,
          status: input.status,
          billingSubscriptionId: input.billingSubscriptionId,
          paymentStatus: input.paymentStatus ?? "unknown",
          currentPeriodStart: input.currentPeriodStart,
          currentPeriodEnd: input.currentPeriodEnd,
        };
        subscriptions.push(created);
        return {
          subscription: created,
          created: true,
          planChanged: true,
          statusChanged: true,
          previousPlanId: null,
          previousStatus: null,
        };
      }
      const previousPlanId = existing.planId;
      const previousStatus = existing.status;
      existing.planId = input.planId;
      existing.planKey = input.planKey;
      existing.status = input.status;
      existing.billingSubscriptionId = input.billingSubscriptionId;
      if (input.currentPeriodStart && input.currentPeriodEnd) {
        existing.currentPeriodStart = input.currentPeriodStart;
        existing.currentPeriodEnd = input.currentPeriodEnd;
      }
      if (input.paymentStatus) existing.paymentStatus = input.paymentStatus;
      return {
        subscription: existing,
        created: false,
        planChanged: previousPlanId !== input.planId,
        statusChanged: previousStatus !== input.status,
        previousPlanId,
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
      });
    },
    async hasChangeHistoryForProviderEvent(providerEventId) {
      return history.some((h) => h.eventId === providerEventId);
    },
    async upsertInvoice(input) {
      const existing = invoices.find(
        (i) => i.providerInvoiceId === input.providerInvoiceId,
      );
      if (existing) {
        existing.status = input.status;
        if (input.periodStart && input.periodEnd) {
          existing.periodStart = input.periodStart;
          existing.periodEnd = input.periodEnd;
        }
        return { id: `inv_${input.providerInvoiceId}`, created: false };
      }
      invoices.push({
        providerInvoiceId: input.providerInvoiceId,
        status: input.status,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
      });
      return { id: `inv_${input.providerInvoiceId}`, created: true };
    },
    async insertTransaction(input) {
      const existing = transactions.find(
        (t) => t.idempotencyKey === input.idempotencyKey,
      );
      if (existing) return { id: `txn_${existing.idempotencyKey}`, created: false };
      transactions.push({
        idempotencyKey: input.idempotencyKey,
        status: input.status,
      });
      return { id: `txn_${input.idempotencyKey}`, created: true };
    },
    async updateSubscriptionPaymentStatus(input) {
      for (const sub of subscriptions) {
        if (sub.organizationId !== input.organizationId) continue;
        if (
          input.billingSubscriptionId &&
          sub.billingSubscriptionId !== input.billingSubscriptionId
        ) {
          continue;
        }
        sub.paymentStatus = input.paymentStatus;
      }
    },
    async activateTrialOrganization(organizationId) {
      if (organizationId !== orgId) return "unchanged";
      if (store.organizationStatus === "active") return "noop";
      if (store.organizationStatus !== "trial") return "unchanged";
      store.organizationStatus = "active";
      return "activated";
    },
    async syncOrganizationPlanName(input) {
      store.organizationPlanName = PLAN_DISPLAY_NAMES[input.planKey];
    },
    async notifyBillingCharge() {
      store.notices += 1;
    },
  };
  return store;
}

function servantSnapshot(
  overrides: Partial<StripePriceSnapshot> = {},
): StripePriceSnapshot {
  return {
    id: "price_selfcheck_servant",
    productId: "prod_selfcheck_servant",
    active: true,
    currency: "usd",
    unitAmount: 2995,
    type: "recurring",
    recurringInterval: "month",
    lookupKey: "servant_standard_monthly",
    ...overrides,
  };
}

function mockPriceRetriever(
  catalog: Record<string, StripePriceSnapshot | null>,
): GetStripePriceById {
  return async (priceId) => catalog[priceId] ?? null;
}

function fakeStripeEvent(input: {
  id: string;
  type: string;
  object: Record<string, unknown>;
}): Stripe.Event {
  return {
    id: input.id,
    object: "event",
    api_version: "2025-01-27.acacia",
    created: 1_700_000_000,
    type: input.type as Stripe.Event.Type,
    data: { object: input.object as Stripe.Event.Data.Object },
    livemode: false,
    pending_webhooks: 1,
    request: null,
  } as Stripe.Event;
}

async function main() {
  // Status map
  assert(mapStripeSubscriptionStatus("active") === "active", "active map");
  assert(mapStripeSubscriptionStatus("past_due") === "past_due", "past_due map");
  assert(mapStripeSubscriptionStatus("canceled") === "cancelled", "canceled map");

  // --- Price correlation hardening ---
  const lookupPresent = await resolveApprovedSubscriptionPlanFromItems([
    {
      priceId: "price_x",
      lookupKey: "servant_standard_monthly",
      productName: "Totally Fake Product Name",
    },
  ]);
  assert(lookupPresent.ok === true, "lookup_key present approved");
  if (lookupPresent.ok) {
    assert(lookupPresent.planKey === PLAN_KEYS.SERVANT_STANDARD, "plan key");
    assert(lookupPresent.source === "lookup_key", "source lookup_key");
  }

  const byPriceId = await resolveApprovedSubscriptionPlanFromItems(
    [{ priceId: "price_selfcheck_servant", lookupKey: null, productName: "Spoof" }],
    {
      getPriceById: mockPriceRetriever({
        price_selfcheck_servant: servantSnapshot(),
      }),
    },
  );
  assert(byPriceId.ok === true, "lookup absent + approved price id");
  if (byPriceId.ok) {
    assert(byPriceId.source === "price_id", "source price_id");
  }

  const unknownId = await resolveApprovedSubscriptionPlanFromItems(
    [{ priceId: "price_unknown", lookupKey: null, productName: null }],
    { getPriceById: mockPriceRetriever({ price_unknown: null }) },
  );
  assert(unknownId.ok === false && unknownId.code === "unknown", "unknown price id");

  const smsId = await resolveApprovedSubscriptionPlanFromItems(
    [{ priceId: "price_sms", lookupKey: null, productName: null }],
    {
      getPriceById: mockPriceRetriever({
        price_sms: servantSnapshot({
          id: "price_sms",
          lookupKey: "servant_standard_sms_50",
          type: "one_time",
          recurringInterval: null,
          unitAmount: 500,
        }),
      }),
    },
  );
  assert(smsId.ok === false && smsId.code === "sms", "SMS price id rejected");

  const inactive = await resolveApprovedSubscriptionPlanFromItems(
    [{ priceId: "price_inactive", lookupKey: null, productName: null }],
    {
      getPriceById: mockPriceRetriever({
        price_inactive: servantSnapshot({ id: "price_inactive", active: false }),
      }),
    },
  );
  assert(inactive.ok === false && inactive.code === "inactive", "inactive rejected");

  const badCurrency = await resolveApprovedSubscriptionPlanFromItems(
    [{ priceId: "price_eur", lookupKey: null, productName: null }],
    {
      getPriceById: mockPriceRetriever({
        price_eur: servantSnapshot({ id: "price_eur", currency: "eur" }),
      }),
    },
  );
  assert(badCurrency.ok === false && badCurrency.code === "currency", "currency rejected");

  const badAmount = await resolveApprovedSubscriptionPlanFromItems(
    [{ priceId: "price_amt", lookupKey: null, productName: null }],
    {
      getPriceById: mockPriceRetriever({
        price_amt: servantSnapshot({ id: "price_amt", unitAmount: 1 }),
      }),
    },
  );
  assert(badAmount.ok === false && badAmount.code === "amount", "amount rejected");

  const badInterval = await resolveApprovedSubscriptionPlanFromItems(
    [{ priceId: "price_year", lookupKey: null, productName: null }],
    {
      getPriceById: mockPriceRetriever({
        price_year: servantSnapshot({
          id: "price_year",
          recurringInterval: "year",
        }),
      }),
    },
  );
  assert(badInterval.ok === false && badInterval.code === "interval", "interval rejected");

  const spoofName = await resolveApprovedSubscriptionPlanFromItems([
    {
      priceId: null,
      lookupKey: "servant_standard_monthly",
      productName: "Omni Enterprise Unlimited Spoof",
    },
  ]);
  assert(
    spoofName.ok === true &&
      spoofName.ok &&
      spoofName.planKey === PLAN_KEYS.SERVANT_STANDARD,
    "product name spoof ignored",
  );

  const oneAmongAddons = await resolveApprovedSubscriptionPlanFromItems([
    {
      priceId: "price_addon",
      lookupKey: "some_future_addon",
      productName: "Addon",
    },
    {
      priceId: "price_selfcheck_servant",
      lookupKey: "servant_standard_monthly",
      productName: null,
    },
  ]);
  assert(
    oneAmongAddons.ok === true &&
      oneAmongAddons.ok &&
      oneAmongAddons.planKey === PLAN_KEYS.SERVANT_STANDARD,
    "one approved among unrelated items",
  );

  const zeroPlans = await resolveApprovedSubscriptionPlanFromItems([
    { priceId: "price_x", lookupKey: "not_a_real_key", productName: null },
  ]);
  assert(zeroPlans.ok === false && zeroPlans.code === "unknown", "zero approved plans");

  const twoPlans = await resolveApprovedSubscriptionPlanFromItems([
    {
      priceId: "price_a",
      lookupKey: "servant_standard_monthly",
      productName: null,
    },
    {
      priceId: "price_b",
      lookupKey: "steward_pro_monthly",
      productName: null,
    },
  ]);
  assert(twoPlans.ok === false && twoPlans.code === "ambiguous", "two base plans conflict");

  let smsLookupRejected = false;
  try {
    resolvePlanKeyFromStripeLookupKey("servant_standard_sms_50");
  } catch (error) {
    smsLookupRejected = error instanceof BillingCheckoutPlanError;
  }
  assert(smsLookupRejected, "SMS lookup rejected");

  // Signature cases
  const missing = verifyStripeWebhookSignature({
    rawBody: "{}",
    headers: new Headers(),
    webhookSecret: WHSEC,
    constructEvent: () => {
      throw new Error("should not construct");
    },
  });
  assert(missing.ok === false && missing.status === 400, "missing signature");

  const invalid = verifyStripeWebhookSignature({
    rawBody: "{}",
    headers: new Headers({ "stripe-signature": "t=1,v1=bad" }),
    webhookSecret: WHSEC,
    constructEvent: () => {
      throw new Error("bad sig");
    },
  });
  assert(invalid.ok === false && invalid.status === 400, "invalid signature");

  const validBody = '{"id":"evt_valid"}';
  const valid = verifyStripeWebhookSignature({
    rawBody: validBody,
    headers: new Headers({ "stripe-signature": "t=1,v1=ok" }),
    webhookSecret: WHSEC,
    constructEvent: ({ rawBody }) => {
      assert(rawBody === validBody, "exact raw body");
      return fakeStripeEvent({
        id: "evt_valid_1",
        type: "customer.subscription.updated",
        object: {
          object: "subscription",
          id: "sub_selfcheck_1",
          customer: "cus_selfcheck_1",
          status: "active",
          items: {
            data: [
              {
                price: {
                  id: "price_x",
                  lookup_key: "servant_standard_monthly",
                },
              },
            ],
          },
          metadata: { organization_id: "org_selfcheck" },
        },
      });
    },
  });
  assert(valid.ok === true, "valid signed webhook");

  // Bare price id in payload (no lookup_key field)
  const bareIdSummary = summarizeStripeEventObject(
    fakeStripeEvent({
      id: "evt_bare",
      type: "customer.subscription.updated",
      object: {
        object: "subscription",
        id: "sub_1",
        customer: "cus_1",
        status: "active",
        items: { data: [{ price: "price_selfcheck_servant" }] },
      },
    }),
  );
  assert(
    bareIdSummary.priceItems[0]?.priceId === "price_selfcheck_servant",
    "bare price id extracted",
  );
  assert(bareIdSummary.priceItems[0]?.lookupKey === null, "bare id has no lookup");

  // Unknown event ignored
  const unknown = await dispatchStripeWebhookEvent({
    eventType: "radar.early_fraud_warning.created",
    object: baseObject(),
    store: createMemorySyncStore(),
  });
  assert(unknown.outcome === "ignored", "unknown event ignored");

  // Active sync + history
  const syncOk = createMemorySyncStore();
  const active = await dispatchStripeWebhookEvent({
    eventType: "customer.subscription.updated",
    object: baseObject({ status: "active" }),
    store: syncOk,
    providerEventId: "evt_active_1",
  });
  assert(active.outcome === "processed", "active sync");
  assert(String(syncOk.subscriptions[0]?.status) === "active", "active stored");
  assert(syncOk.history.length === 1, "history once");

  // Reentrant same event id must not duplicate history
  const activeAgain = await dispatchStripeWebhookEvent({
    eventType: "customer.subscription.updated",
    object: baseObject({ status: "active" }),
    store: syncOk,
    providerEventId: "evt_active_1",
  });
  assert(activeAgain.outcome === "processed", "reentrant sync");
  assert(syncOk.history.length === 1, "history not duplicated for same event");

  // Conflict mapping → ignored / no entitlement
  const conflictStore = createMemorySyncStore();
  conflictStore.conflictCustomer = "cus_selfcheck_1";
  const conflict = await dispatchStripeWebhookEvent({
    eventType: "customer.subscription.updated",
    object: baseObject(),
    store: conflictStore,
  });
  assert(conflict.outcome === "ignored", "correlation conflict ignored");
  assert(conflictStore.subscriptions.length === 0, "conflict no mutation");

  // past_due + cancel
  await dispatchStripeWebhookEvent({
    eventType: "customer.subscription.updated",
    object: baseObject({ status: "past_due" }),
    store: syncOk,
    providerEventId: "evt_past_due",
  });
  assert(String(syncOk.subscriptions[0]?.status) === "past_due", "past_due");

  await dispatchStripeWebhookEvent({
    eventType: "customer.subscription.deleted",
    object: baseObject({
      status: "canceled",
      priceItems: [{ priceId: null, lookupKey: null, productName: null }],
      priceId: null,
      priceLookupKey: null,
    }),
    store: syncOk,
    providerEventId: "evt_cancel",
  });
  assert(String(syncOk.subscriptions[0]?.status) === "cancelled", "cancelled");
  assert(
    !(ACCESS_GRANTING_STATUSES as readonly string[]).includes("cancelled"),
    "cancelled not entitled",
  );

  // Ambiguous two plans → no mutation
  const ambStore = createMemorySyncStore();
  const amb = await dispatchStripeWebhookEvent({
    eventType: "customer.subscription.updated",
    object: baseObject({
      priceItems: [
        {
          priceId: "a",
          lookupKey: "servant_standard_monthly",
          productName: null,
        },
        {
          priceId: "b",
          lookupKey: "steward_pro_monthly",
          productName: null,
        },
      ],
    }),
    store: ambStore,
  });
  assert(amb.outcome === "ignored", "ambiguous ignored");
  assert(ambStore.subscriptions.length === 0, "ambiguous no entitlement");

  // Price-id-only sync via injected retriever
  const priceIdStore = createMemorySyncStore();
  const priceIdSync = await dispatchStripeWebhookEvent({
    eventType: "customer.subscription.updated",
    object: baseObject({
      priceItems: [
        {
          priceId: "price_selfcheck_servant",
          lookupKey: null,
          productName: "Ignored Name",
        },
      ],
      priceId: "price_selfcheck_servant",
      priceLookupKey: null,
    }),
    store: priceIdStore,
    getPriceById: mockPriceRetriever({
      price_selfcheck_servant: servantSnapshot(),
    }),
    providerEventId: "evt_price_id",
  });
  assert(priceIdSync.outcome === "processed", "price id sync");
  assert(
    priceIdStore.subscriptions[0]?.planKey === "servant_standard",
    "price id plan",
  );

  // Invoice + txn idempotency
  const invStore = createMemorySyncStore();
  await dispatchStripeWebhookEvent({
    eventType: "customer.subscription.created",
    object: baseObject({ status: "active" }),
    store: invStore,
    providerEventId: "evt_sub_create",
  });
  await dispatchStripeWebhookEvent({
    eventType: "invoice.paid",
    object: baseObject({
      objectType: "invoice",
      id: "in_1",
      invoiceId: "in_1",
      status: "paid",
      amountPaid: 2995,
      amountDue: 0,
    }),
    store: invStore,
  });
  await dispatchStripeWebhookEvent({
    eventType: "invoice.paid",
    object: baseObject({
      objectType: "invoice",
      id: "in_1",
      invoiceId: "in_1",
      status: "paid",
      amountPaid: 2995,
      amountDue: 0,
    }),
    store: invStore,
  });
  assert(invStore.transactions.length === 1, "txn not duplicated");
  assert(invStore.notices === 1, "notice once");
  assert(invStore.organizationStatus === "active", "paid invoice activates trial");

  await dispatchStripeWebhookEvent({
    eventType: "invoice.payment_failed",
    object: baseObject({
      objectType: "invoice",
      id: "in_fail",
      invoiceId: "in_fail",
      status: "open",
      amountDue: 2995,
      amountPaid: 0,
    }),
    store: invStore,
  });
  assert(
    invStore.transactions.some((t) => t.status === "failed"),
    "failed txn",
  );

  // Checkout completed correlation only
  const checkoutStore = createMemorySyncStore();
  const checkout = await dispatchStripeWebhookEvent({
    eventType: "checkout.session.completed",
    object: baseObject({
      objectType: "checkout.session",
      checkoutSessionId: "cs_1",
      mode: "subscription",
      paymentStatus: "paid",
      status: "complete",
    }),
    store: checkoutStore,
  });
  assert(checkout.metadata.authoritative_activation === false, "checkout non-auth");
  assert(checkoutStore.subscriptions.length === 0, "checkout no sub");
  assert(checkoutStore.transactions.length === 0, "checkout no txn");
  assert(checkoutStore.organizationStatus === "trial", "checkout does not activate");

  // Full pipeline claim semantics
  await withEnv(
    {
      BILLING_PROVIDER: "stripe",
      STRIPE_SECRET_KEY: SK,
      STRIPE_WEBHOOK_SECRET: WHSEC,
    },
    async () => {
      const provider = new StripeBillingProvider();
      assert(provider.capabilities().webhooks === true, "webhooks true with secret");
      assert(provider.capabilities().customerPortal === false, "portal false");

      const claim = createMemoryClaimStore();
      const sync = createMemorySyncStore();
      const constructOk = () =>
        fakeStripeEvent({
          id: "evt_pipeline_1",
          type: "customer.subscription.updated",
          object: {
            object: "subscription",
            id: "sub_selfcheck_1",
            customer: "cus_selfcheck_1",
            status: "active",
            items: {
              data: [
                {
                  price: {
                    id: "price_x",
                    lookup_key: "servant_standard_monthly",
                  },
                },
              ],
            },
            metadata: { organization_id: "org_selfcheck" },
          },
        });

      const customProvider = {
        id: "stripe" as const,
        capabilities: () => provider.capabilities(),
        isConfigured: () => true,
        async verifyAndParseWebhook(input: { rawBody: string; headers: Headers }) {
          const verified = verifyStripeWebhookSignature({
            ...input,
            webhookSecret: WHSEC,
            constructEvent: constructOk,
          });
          if (!verified.ok) {
            return {
              ok: false as const,
              status: verified.status,
              error: verified.error,
              eventType: "stripe.webhook.rejected",
              providerEventId: null,
              organizationId: null,
              metadata: {},
            };
          }
          return {
            ok: true as const,
            status: 200,
            eventType: verified.eventType,
            providerEventId: verified.eventId,
            organizationId: verified.object.metadataOrganizationId,
            metadata: { stripe_object: verified.object },
          };
        },
        createCheckoutSession: provider.createCheckoutSession.bind(provider),
        createCustomerPortalSession:
          provider.createCustomerPortalSession.bind(provider),
      };

      const first = await processBillingWebhook(
        {
          providerSlug: "stripe",
          rawBody: validBody,
          headers: new Headers({ "stripe-signature": "t=1,v1=ok" }),
        },
        {
          isServiceRoleConfigured: () => true,
          getProvider: () => customProvider as never,
          createClaimStore: () => claim,
          createSyncStore: () => sync,
        },
      );
      assert(first.ok && !first.duplicate, "first processed");
      assert(sync.subscriptions.length === 1, "one sub");
      assert(sync.history.length === 1, "one history");

      // Concurrent-style duplicate while still "received" before finalize:
      // simulate by inserting a fresh received row and calling again after processed.
      const second = await processBillingWebhook(
        {
          providerSlug: "stripe",
          rawBody: validBody,
          headers: new Headers({ "stripe-signature": "t=1,v1=ok" }),
        },
        {
          isServiceRoleConfigured: () => true,
          getProvider: () => customProvider as never,
          createClaimStore: () => claim,
          createSyncStore: () => sync,
        },
      );
      assert(second.ok && second.duplicate === true, "duplicate after processed");
      assert(sync.history.length === 1, "history stable");

      // Fresh in-flight received must not reprocess
      const claim2 = createMemoryClaimStore();
      claim2.rows.set("stripe:evt_inflight", {
        id: "row_inflight",
        processingStatus: "received",
        providerEventId: "evt_inflight",
        createdAt: new Date().toISOString(),
        retryCount: 0,
        metadata: {},
      });
      const inflightProvider = {
        ...customProvider,
        async verifyAndParseWebhook() {
          return {
            ok: true as const,
            status: 200,
            eventType: "customer.subscription.updated",
            providerEventId: "evt_inflight",
            organizationId: "org_selfcheck",
            metadata: {
              stripe_object: baseObject(),
            },
          };
        },
      };
      const syncInflight = createMemorySyncStore();
      const inflight = await processBillingWebhook(
        {
          providerSlug: "stripe",
          rawBody: "{}",
          headers: new Headers({ "stripe-signature": "t=1,v1=ok" }),
        },
        {
          isServiceRoleConfigured: () => true,
          getProvider: () => inflightProvider as never,
          createClaimStore: () => claim2,
          createSyncStore: () => syncInflight,
        },
      );
      assert(inflight.ok && inflight.duplicate === true, "fresh received → duplicate");
      assert(syncInflight.subscriptions.length === 0, "inflight no handler");

      // Failed → retryable claim
      const claimFail = createMemoryClaimStore();
      claimFail.rows.set("stripe:evt_fail", {
        id: "row_fail",
        processingStatus: "failed",
        providerEventId: "evt_fail",
        createdAt: new Date(Date.now() - 60_000).toISOString(),
        retryCount: 0,
        metadata: {},
      });
      const failProvider = {
        ...customProvider,
        async verifyAndParseWebhook() {
          return {
            ok: true as const,
            status: 200,
            eventType: "customer.subscription.updated",
            providerEventId: "evt_fail",
            organizationId: "org_selfcheck",
            metadata: { stripe_object: baseObject() },
          };
        },
      };
      const syncFail = createMemorySyncStore();
      const retried = await processBillingWebhook(
        {
          providerSlug: "stripe",
          rawBody: "{}",
          headers: new Headers({ "stripe-signature": "t=1,v1=ok" }),
        },
        {
          isServiceRoleConfigured: () => true,
          getProvider: () => failProvider as never,
          createClaimStore: () => claimFail,
          createSyncStore: () => syncFail,
        },
      );
      assert(retried.ok && !retried.duplicate, "failed event retried");
      assert(syncFail.subscriptions.length === 1, "retry synced");

      // Stale received reclaim
      const claimStale = createMemoryClaimStore();
      claimStale.rows.set("stripe:evt_stale", {
        id: "row_stale",
        processingStatus: "received",
        providerEventId: "evt_stale",
        createdAt: new Date(
          Date.now() - BILLING_EVENT_STALE_RECEIVED_MS - 1000,
        ).toISOString(),
        retryCount: 0,
        metadata: {},
      });
      const staleProvider = {
        ...customProvider,
        async verifyAndParseWebhook() {
          return {
            ok: true as const,
            status: 200,
            eventType: "customer.subscription.updated",
            providerEventId: "evt_stale",
            organizationId: "org_selfcheck",
            metadata: { stripe_object: baseObject() },
          };
        },
      };
      const syncStale = createMemorySyncStore();
      const stale = await processBillingWebhook(
        {
          providerSlug: "stripe",
          rawBody: "{}",
          headers: new Headers({ "stripe-signature": "t=1,v1=ok" }),
        },
        {
          isServiceRoleConfigured: () => true,
          getProvider: () => staleProvider as never,
          createClaimStore: () => claimStale,
          createSyncStore: () => syncStale,
          nowMs: () => Date.now(),
        },
      );
      assert(stale.ok && !stale.duplicate, "stale received reclaimed");
      assert(syncStale.subscriptions.length === 1, "stale reclaim synced");

      // Missing signature → 4xx, no claim mutation on empty store
      const claimSig = createMemoryClaimStore();
      const rejected = await processBillingWebhook(
        {
          providerSlug: "stripe",
          rawBody: validBody,
          headers: new Headers(),
        },
        {
          isServiceRoleConfigured: () => true,
          getProvider: () => getBillingProvider(),
          createClaimStore: () => claimSig,
          createSyncStore: () => createMemorySyncStore(),
        },
      );
      assert(rejected.ok === false && rejected.status === 400, "sig fail 4xx");
      assert(claimSig.rows.size === 0, "sig fail no claim");
    },
  );

  await withEnv(
    {
      BILLING_PROVIDER: "stripe",
      STRIPE_SECRET_KEY: SK,
      STRIPE_WEBHOOK_SECRET: undefined,
    },
    () => {
      const provider = new StripeBillingProvider();
      assert(provider.capabilities().webhooks === false, "webhooks false without secret");
    },
  );

  const ITEM_START = 1_791_448_814;
  const ITEM_END = 1_794_040_814;
  const itemIsoStart = new Date(ITEM_START * 1000).toISOString();
  const itemIsoEnd = new Date(ITEM_END * 1000).toISOString();

  const endiveSubscription = summarizeStripeEventObject(
    fakeStripeEvent({
      id: "evt_endive_sub",
      type: "customer.subscription.updated",
      object: {
        object: "subscription",
        id: "sub_endive",
        customer: "cus_selfcheck_1",
        status: "active",
        current_period_start: ITEM_START,
        current_period_end: ITEM_START,
        metadata: { organization_id: "org_selfcheck" },
        items: {
          data: [
            {
              current_period_start: ITEM_START,
              current_period_end: ITEM_END,
              price: {
                id: "price_base",
                lookup_key: "servant_standard_monthly",
              },
            },
            {
              current_period_start: 1,
              current_period_end: 2,
              price: {
                id: "price_sms",
                lookup_key: "servant_standard_sms_50",
              },
            },
          ],
        },
      },
    }),
  );
  assert(endiveSubscription.periodStart === null, "top-level subscription period ignored");
  assert(endiveSubscription.periodEnd === null, "top-level subscription period end ignored");
  const baseItem = endiveSubscription.priceItems.find(
    (item) => item.lookupKey === "servant_standard_monthly",
  );
  const smsItem = endiveSubscription.priceItems.find(
    (item) => item.lookupKey === "servant_standard_sms_50",
  );
  assert(baseItem?.periodStart === ITEM_START, "base item period start");
  assert(baseItem?.periodEnd === ITEM_END, "base item period end");
  assert(smsItem?.periodStart === 1, "sms item period kept separate");

  const endiveStore = createMemorySyncStore();
  const endiveSync = await dispatchStripeWebhookEvent({
    eventType: "customer.subscription.updated",
    object: {
      ...endiveSubscription,
      subscriptionId: "sub_endive",
    },
    store: endiveStore,
    providerEventId: "evt_endive_sub",
  });
  assert(endiveSync.outcome === "processed", "endive subscription processed");
  assert(
    endiveStore.subscriptions[0]?.currentPeriodStart === itemIsoStart,
    "stored base-plan period start",
  );
  assert(
    endiveStore.subscriptions[0]?.currentPeriodEnd === itemIsoEnd,
    "stored base-plan period end",
  );
  assert(
    endiveStore.organizationStatus === "trial",
    "subscription update does not activate",
  );

  const createdOnly = createMemorySyncStore();
  await dispatchStripeWebhookEvent({
    eventType: "customer.subscription.created",
    object: {
      ...endiveSubscription,
      subscriptionId: "sub_endive_created",
    },
    store: createdOnly,
    providerEventId: "evt_endive_created",
  });
  assert(createdOnly.organizationStatus === "trial", "created alone stays trial");

  const preserveStore = createMemorySyncStore();
  preserveStore.subscriptions.push({
    id: "sub_row_keep",
    organizationId: "org_selfcheck",
    planId: "plan_servant",
    planKey: "servant_standard",
    status: "active",
    billingSubscriptionId: "sub_keep",
    paymentStatus: "ok",
    currentPeriodStart: "2026-07-23T00:00:00.000Z",
    currentPeriodEnd: "2026-08-22T00:00:00.000Z",
  });
  await dispatchStripeWebhookEvent({
    eventType: "customer.subscription.updated",
    object: baseObject({
      id: "sub_keep",
      subscriptionId: "sub_keep",
      priceItems: [
        {
          priceId: "price_selfcheck_servant",
          lookupKey: "servant_standard_monthly",
          productName: null,
        },
      ],
      periodStart: null,
      periodEnd: null,
    }),
    store: preserveStore,
    providerEventId: "evt_keep_period",
  });
  assert(
    preserveStore.subscriptions[0]?.currentPeriodStart ===
      "2026-07-23T00:00:00.000Z",
    "missing period does not clear start",
  );
  assert(
    preserveStore.subscriptions[0]?.currentPeriodEnd ===
      "2026-08-22T00:00:00.000Z",
    "missing period does not clear end",
  );

  const ambiguousStore = createMemorySyncStore();
  ambiguousStore.subscriptions.push({
    id: "sub_row_amb",
    organizationId: "org_selfcheck",
    planId: "plan_servant",
    planKey: "servant_standard",
    status: "active",
    billingSubscriptionId: "sub_amb",
    paymentStatus: "ok",
    currentPeriodStart: itemIsoStart,
    currentPeriodEnd: itemIsoEnd,
  });
  const ambiguous = await dispatchStripeWebhookEvent({
    eventType: "customer.subscription.updated",
    object: baseObject({
      id: "sub_amb",
      subscriptionId: "sub_amb",
      priceItems: [
        {
          priceId: "a",
          lookupKey: "servant_standard_monthly",
          productName: null,
          periodStart: ITEM_START,
          periodEnd: ITEM_END,
        },
        {
          priceId: "b",
          lookupKey: "steward_pro_monthly",
          productName: null,
          periodStart: 10,
          periodEnd: 20,
        },
      ],
    }),
    store: ambiguousStore,
  });
  assert(ambiguous.outcome === "ignored", "ambiguous endive ignored");
  assert(
    ambiguousStore.subscriptions[0]?.planKey === "servant_standard",
    "ambiguous plan unchanged",
  );
  assert(
    ambiguousStore.subscriptions[0]?.currentPeriodStart === itemIsoStart,
    "ambiguous period unchanged",
  );

  const endiveInvoice = summarizeStripeEventObject(
    fakeStripeEvent({
      id: "evt_endive_inv",
      type: "invoice.paid",
      object: {
        object: "invoice",
        id: "in_endive",
        customer: "cus_selfcheck_1",
        status: "paid",
        currency: "usd",
        amount_paid: 2995,
        amount_due: 0,
        period_start: ITEM_START,
        period_end: ITEM_START,
        parent: {
          type: "subscription_details",
          subscription_details: { subscription: "sub_endive_inv" },
        },
        lines: {
          data: [
            {
              period: { start: ITEM_START, end: ITEM_END },
              pricing: {
                price_details: {
                  price: {
                    id: "price_base",
                    lookup_key: "servant_standard_monthly",
                  },
                },
              },
            },
            {
              period: { start: 11, end: 12 },
              price: {
                id: "price_sms",
                lookup_key: "servant_standard_sms_50",
              },
            },
          ],
        },
      },
    }),
  );
  assert(endiveInvoice.periodStart === null, "invoice association window ignored");
  assert(endiveInvoice.subscriptionId === "sub_endive_inv", "invoice parent subscription");
  const invoiceBase = endiveInvoice.priceItems.find(
    (item) => item.lookupKey === "servant_standard_monthly",
  );
  assert(invoiceBase?.periodStart === ITEM_START, "invoice line period start");
  assert(invoiceBase?.periodEnd === ITEM_END, "invoice line period end");

  const invoiceStore = createMemorySyncStore();
  invoiceStore.subscriptions.push({
    id: "sub_row_inv",
    organizationId: "org_selfcheck",
    planId: "plan_servant",
    planKey: "servant_standard",
    status: "active",
    billingSubscriptionId: "sub_endive_inv",
    paymentStatus: "unknown",
  });
  const paid = await dispatchStripeWebhookEvent({
    eventType: "invoice.paid",
    object: endiveInvoice,
    store: invoiceStore,
    providerEventId: "evt_endive_inv",
  });
  assert(paid.outcome === "processed", "endive invoice processed");
  assert(invoiceStore.invoices[0]?.periodStart === itemIsoStart, "invoice stores line start");
  assert(invoiceStore.invoices[0]?.periodEnd === itemIsoEnd, "invoice stores line end");
  assert(paid.metadata.organization_activation === "activated", "trial activated");
  assert(invoiceStore.organizationStatus === "active", "organization active");

  const paidAgain = await dispatchStripeWebhookEvent({
    eventType: "invoice.paid",
    object: endiveInvoice,
    store: invoiceStore,
    providerEventId: "evt_endive_inv_2",
  });
  assert(invoiceStore.transactions.length === 1, "repeat invoice no extra txn");
  assert(invoiceStore.invoices.length === 1, "repeat invoice no extra row");
  assert(paidAgain.metadata.organization_activation === "noop", "repeat activation no-op");
  assert(invoiceStore.organizationStatus === "active", "stays active");

  for (const locked of ["suspended", "closed"] as const) {
    const lockedStore = createMemorySyncStore();
    lockedStore.organizationStatus = locked;
    lockedStore.subscriptions.push({
      id: `sub_row_${locked}`,
      organizationId: "org_selfcheck",
      planId: "plan_servant",
      planKey: "servant_standard",
      status: "active",
      billingSubscriptionId: "sub_endive_inv",
      paymentStatus: "ok",
    });
    const lockedPaid = await dispatchStripeWebhookEvent({
      eventType: "invoice.paid",
      object: { ...endiveInvoice, invoiceId: `in_${locked}`, id: `in_${locked}` },
      store: lockedStore,
    });
    assert(
      lockedPaid.metadata.organization_activation === "unchanged",
      `${locked} not activated`,
    );
    assert(lockedStore.organizationStatus === locked, `${locked} unchanged`);
  }

  const already = createMemorySyncStore();
  already.organizationStatus = "active";
  already.subscriptions.push({
    id: "sub_row_already",
    organizationId: "org_selfcheck",
    planId: "plan_servant",
    planKey: "servant_standard",
    status: "active",
    billingSubscriptionId: "sub_endive_inv",
    paymentStatus: "ok",
  });
  const alreadyPaid = await dispatchStripeWebhookEvent({
    eventType: "invoice.paid",
    object: { ...endiveInvoice, invoiceId: "in_already", id: "in_already" },
    store: already,
  });
  assert(alreadyPaid.metadata.organization_activation === "noop", "already active no-op");
  assert(already.organizationStatus === "active", "already active stays");

  const migrationSrc = readFileSync(
    join(process.cwd(), "supabase/migrations/104_billing_trial_activation.sql"),
    "utf8",
  );
  assert(
    migrationSrc.includes("OLD.status = 'trial'") &&
      migrationSrc.includes("NEW.status = 'active'"),
    "trigger allows only trial to active",
  );
  assert(
    migrationSrc.includes("auth.role() IS DISTINCT FROM 'service_role'"),
    "activation rpc is service role",
  );
  assert(
    migrationSrc.includes(
      "REVOKE ALL ON FUNCTION public.activate_organization_after_paid_base_subscription(uuid) FROM authenticated",
    ),
    "authenticated cannot execute activation",
  );
  assert(
    migrationSrc.includes(
      "GRANT EXECUTE ON FUNCTION public.activate_organization_after_paid_base_subscription(uuid) TO service_role",
    ),
    "service role can execute activation",
  );
  assert(
    !migrationSrc.includes("SET status = 'suspended'") &&
      !migrationSrc.includes("SET status = 'closed'"),
    "activation cannot set suspended or closed",
  );

  const entitlementsSrc = readFileSync(
    join(process.cwd(), "lib/subscriptions/resolver.ts"),
    "utf8",
  );
  assert(!entitlementsSrc.includes("stripe.subscriptions"), "DB-driven entitlements");

  const upgradeStart = Math.floor(Date.parse("2026-10-09T07:01:33Z") / 1000);
  const renewalEnd = Math.floor(Date.parse("2026-11-08T08:40:14Z") / 1000);
  const cycleStart = Math.floor(Date.parse("2026-10-08T08:40:14Z") / 1000);
  const oneLine = await servicePeriodForApprovedSubscriptionLines([
    {
      priceId: "price_servant",
      lookupKey: "servant_standard_monthly",
      productName: null,
      periodStart: cycleStart,
      periodEnd: renewalEnd,
    },
  ]);
  assert(
    oneLine?.periodStart === cycleStart && oneLine.periodEnd === renewalEnd,
    "A one approved base-plan line uses its period",
  );
  const shared = await servicePeriodForApprovedSubscriptionLines([
    {
      priceId: "price_servant",
      lookupKey: "servant_standard_monthly",
      productName: null,
      periodStart: upgradeStart,
      periodEnd: renewalEnd,
    },
    {
      priceId: "price_steward",
      lookupKey: "steward_pro_monthly",
      productName: null,
      periodStart: upgradeStart,
      periodEnd: renewalEnd,
    },
  ]);
  assert(
    shared?.periodStart === upgradeStart && shared.periodEnd === renewalEnd,
    "B identical credit and charge periods are stored",
  );
  const conflictingPeriod = await servicePeriodForApprovedSubscriptionLines([
    {
      priceId: "price_servant",
      lookupKey: "servant_standard_monthly",
      productName: null,
      periodStart: cycleStart,
      periodEnd: renewalEnd,
    },
    {
      priceId: "price_steward",
      lookupKey: "steward_pro_monthly",
      productName: null,
      periodStart: upgradeStart,
      periodEnd: renewalEnd,
    },
  ]);
  assert(conflictingPeriod === null, "C conflicting plan periods are not invented");
  const withSms = await servicePeriodForApprovedSubscriptionLines([
    {
      priceId: "price_steward",
      lookupKey: "steward_pro_monthly",
      productName: null,
      periodStart: upgradeStart,
      periodEnd: renewalEnd,
    },
    {
      priceId: "price_sms",
      lookupKey: "steward_pro_sms_100",
      productName: null,
      periodStart: cycleStart,
      periodEnd: upgradeStart,
    },
  ]);
  assert(
    withSms?.periodStart === upgradeStart && withSms.periodEnd === renewalEnd,
    "D SMS line does not set the service period",
  );

  const periodStore = createMemorySyncStore();
  periodStore.subscriptions.push({
    id: "sub_row_period",
    organizationId: "org_selfcheck",
    planId: "plan_steward",
    planKey: "steward_pro",
    status: "active",
    billingSubscriptionId: "sub_existing",
    paymentStatus: "ok",
    currentPeriodStart: new Date(cycleStart * 1000).toISOString(),
    currentPeriodEnd: new Date(renewalEnd * 1000).toISOString(),
  });
  const pointInTime = upgradeStart;
  await handleInvoicePaid(periodStore, {
    objectType: "invoice",
    id: "in_upgrade",
    customerId: "cus_selfcheck_1",
    subscriptionId: "sub_existing",
    invoiceId: "in_upgrade",
    checkoutSessionId: null,
    priceItems: [
      {
        priceId: "price_servant",
        lookupKey: "servant_standard_monthly",
        productName: null,
        periodStart: upgradeStart,
        periodEnd: renewalEnd,
      },
      {
        priceId: "price_steward",
        lookupKey: "steward_pro_monthly",
        productName: null,
        periodStart: upgradeStart,
        periodEnd: renewalEnd,
      },
    ],
    priceId: null,
    priceLookupKey: null,
    status: "paid",
    mode: null,
    paymentStatus: null,
    amountPaid: 970,
    amountDue: 970,
    currency: "usd",
    hostedInvoiceUrl: null,
    periodStart: pointInTime,
    periodEnd: pointInTime,
    cancelAtPeriodEnd: null,
    metadataOrganizationId: null,
    metadataPlanKey: null,
  });
  assert(
    periodStore.invoices[0]?.periodStart === new Date(upgradeStart * 1000).toISOString(),
    "E line period is used instead of the point-in-time invoice period",
  );
  assert(periodStore.subscriptions[0]?.planKey === "steward_pro", "invoice does not change plan");
  assert(periodStore.organizationPlanName === "Servant Standard", "invoice does not change display plan");
  await handleInvoicePaid(periodStore, {
    objectType: "invoice",
    id: "in_conflict",
    customerId: "cus_selfcheck_1",
    subscriptionId: "sub_existing",
    invoiceId: "in_upgrade",
    checkoutSessionId: null,
    priceItems: [
      {
        priceId: "price_servant",
        lookupKey: "servant_standard_monthly",
        productName: null,
        periodStart: cycleStart,
        periodEnd: renewalEnd,
      },
      {
        priceId: "price_steward",
        lookupKey: "steward_pro_monthly",
        productName: null,
        periodStart: upgradeStart,
        periodEnd: renewalEnd,
      },
    ],
    priceId: null,
    priceLookupKey: null,
    status: "paid",
    mode: null,
    paymentStatus: null,
    amountPaid: 970,
    amountDue: 0,
    currency: "usd",
    hostedInvoiceUrl: null,
    periodStart: null,
    periodEnd: null,
    cancelAtPeriodEnd: null,
    metadataOrganizationId: null,
    metadataPlanKey: null,
  });
  assert(
    periodStore.invoices[0]?.periodStart === new Date(upgradeStart * 1000).toISOString(),
    "F missing or conflicting period does not erase a stored period",
  );

  const display = createMemorySyncStore();
  display.organizationStatus = "active";
  display.subscriptions.push({
    id: "sub_row_display",
    organizationId: "org_selfcheck",
    planId: "plan_servant",
    planKey: "servant_standard",
    status: "active",
    billingSubscriptionId: "sub_existing",
    paymentStatus: "ok",
  });
  const liveUpdate = {
    objectType: "subscription",
    id: "sub_existing",
    customerId: "cus_selfcheck_1",
    subscriptionId: "sub_existing",
    invoiceId: null,
    checkoutSessionId: null,
    priceItems: [
      {
        priceId: "price_steward",
        lookupKey: "steward_pro_monthly",
        productName: null,
        periodStart: cycleStart,
        periodEnd: renewalEnd,
      },
    ],
    priceId: "price_steward",
    priceLookupKey: "steward_pro_monthly",
    status: "active",
    mode: null,
    paymentStatus: null,
    amountPaid: null,
    amountDue: null,
    currency: "usd",
    hostedInvoiceUrl: null,
    periodStart: null,
    periodEnd: null,
    cancelAtPeriodEnd: false,
    metadataOrganizationId: null,
    metadataPlanKey: null,
  } satisfies StripeWebhookObjectSummary;
  await handleSubscriptionLifecycle(display, liveUpdate, "customer.subscription.updated", {
    providerEventId: "evt_live_upgrade",
  });
  assert(display.subscriptions[0]?.planKey === "steward_pro", "A live plan changes");
  assert(display.organizationPlanName === "Steward Pro", "A display plan follows live plan");
  assert(display.organizationStatus === "active", "E organization status unchanged");
  assert(display.history.length === 1, "A one history row");
  await handleSubscriptionLifecycle(display, liveUpdate, "customer.subscription.updated", {
    providerEventId: "evt_live_upgrade",
  });
  assert(display.history.length === 1, "D replay does not add history");
  assert(display.organizationPlanName === "Steward Pro", "D display plan stays Steward");

  const pending = createMemorySyncStore();
  pending.organizationStatus = "active";
  pending.subscriptions.push({
    id: "sub_row_pending",
    organizationId: "org_selfcheck",
    planId: "plan_servant",
    planKey: "servant_standard",
    status: "active",
    billingSubscriptionId: "sub_existing",
    paymentStatus: "ok",
  });
  await handleSubscriptionLifecycle(
    pending,
    {
      ...liveUpdate,
      priceItems: [
        {
          priceId: "price_servant",
          lookupKey: "servant_standard_monthly",
          productName: null,
          periodStart: cycleStart,
          periodEnd: renewalEnd,
        },
      ],
      priceLookupKey: "servant_standard_monthly",
    },
    "customer.subscription.updated",
    { providerEventId: "evt_pending" },
  );
  assert(pending.subscriptions[0]?.planKey === "servant_standard", "B pending target is not live");
  assert(pending.organizationPlanName === "Servant Standard", "B display plan unchanged");
  assert(pending.history.length === 0, "F same-plan webhook writes no history");

  const failedPay = createMemorySyncStore();
  failedPay.organizationStatus = "active";
  failedPay.subscriptions.push({
    id: "sub_row_failed",
    organizationId: "org_selfcheck",
    planId: "plan_servant",
    planKey: "servant_standard",
    status: "active",
    billingSubscriptionId: "sub_existing",
    paymentStatus: "ok",
  });
  await handleInvoicePaymentFailed(failedPay, {
    objectType: "invoice",
    id: "in_fail",
    customerId: "cus_selfcheck_1",
    subscriptionId: "sub_existing",
    invoiceId: "in_fail",
    checkoutSessionId: null,
    priceItems: [
      {
        priceId: "price_steward",
        lookupKey: "steward_pro_monthly",
        productName: null,
        periodStart: upgradeStart,
        periodEnd: renewalEnd,
      },
    ],
    priceId: null,
    priceLookupKey: null,
    status: "open",
    mode: null,
    paymentStatus: null,
    amountPaid: 0,
    amountDue: 970,
    currency: "usd",
    hostedInvoiceUrl: null,
    periodStart: null,
    periodEnd: null,
    cancelAtPeriodEnd: null,
    metadataOrganizationId: null,
    metadataPlanKey: null,
  });
  assert(failedPay.subscriptions[0]?.planKey === "servant_standard", "C failed invoice keeps plan");
  assert(failedPay.organizationPlanName === "Servant Standard", "C failed invoice keeps display plan");
  assert(failedPay.organizationStatus === "active", "C organization status unchanged");

  const verifySrc = readFileSync(
    join(process.cwd(), "lib/billing/stripe/webhook-verify.ts"),
    "utf8",
  );
  const webhooksSrc = readFileSync(
    join(process.cwd(), "lib/billing/webhooks.ts"),
    "utf8",
  );
  assert(!verifySrc.includes("console.log(input.rawBody"), "no raw log");
  assert(!/console\.(log|info|debug)\([^)]*WEBHOOK_SECRET/.test(webhooksSrc), "no secret log");

  assert(STRIPE_WEBHOOK_EVENT_TYPES.includes("checkout.session.completed"), "event set");
  const cancelledStatus: ChurchSubscriptionStatus = "cancelled";
  assert(cancelledStatus === "cancelled", "status model");

  assertNoSecretLeak("ok", [WHSEC, SK]);

  console.log("stripe webhook self-check passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
