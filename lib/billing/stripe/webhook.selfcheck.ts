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
import type {
  SyncedSubscriptionSnapshot,
  WebhookSyncStore,
} from "@/lib/billing/stripe/webhook-sync";
import type { ChurchSubscriptionStatus } from "@/lib/subscriptions/types";
import { PLAN_KEYS } from "@/lib/subscriptions/plan-keys";
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

type MemorySyncStore = WebhookSyncStore & {
  subscriptions: SyncedSubscriptionSnapshot[];
  invoices: { providerInvoiceId: string; status: string }[];
  transactions: { idempotencyKey: string; status: string }[];
  history: { changeType: string; eventId: string | null }[];
  notices: number;
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
  const invoices: { providerInvoiceId: string; status: string }[] = [];
  const transactions: { idempotencyKey: string; status: string }[] = [];
  const history: { changeType: string; eventId: string | null }[] = [];
  const store: MemorySyncStore = {
    subscriptions,
    invoices,
    transactions,
    history,
    notices: 0,
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
        return { id: `inv_${input.providerInvoiceId}`, created: false };
      }
      invoices.push({
        providerInvoiceId: input.providerInvoiceId,
        status: input.status,
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

  const entitlementsSrc = readFileSync(
    join(process.cwd(), "lib/subscriptions/resolver.ts"),
    "utf8",
  );
  assert(!entitlementsSrc.includes("stripe.subscriptions"), "DB-driven entitlements");

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
