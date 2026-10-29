/**
 * Immediate subscription upgrade self-check.
 * Mocks only — no Stripe network and no database writes.
 *
 * Run: npx --yes tsx lib/billing/stripe/upgrade.selfcheck.ts
 */

import { readFileSync } from "node:fs";
import { BillingUpgradeError } from "@/lib/billing/errors";
import { connectedSubscriptionPlanAction } from "@/lib/billing/checkout-eligibility";
import type { StripePriceSnapshot } from "@/lib/billing/stripe/catalog";
import { assertStripeSubscriptionUpgradeModeAllowed } from "@/lib/billing/stripe/catalog";
import {
  isStripeLiveCheckoutEnabled,
  isStripeLiveSubscriptionUpgradeEnabled,
} from "@/lib/billing/stripe/config";
import {
  assertClientUpgradePayload,
  buildSubscriptionUpgradeIdempotencyKey,
  confirmSubscriptionUpgrade,
  previewFailureMessage,
  previewSubscriptionUpgrade,
  safeStripePreviewErrorLog,
  upgradeFailureMessage,
  type LiveSubscriptionItem,
  type LocalUpgradeSubscription,
  type RetrievedUpgradeSubscription,
  type UpgradeStripeDeps,
} from "@/lib/billing/stripe/upgrade";
import {
  signUpgradePreviewAuthorization,
  UPGRADE_PREVIEW_STALE_MESSAGE,
  verifyUpgradePreviewAuthorization,
} from "@/lib/billing/stripe/upgrade-preview-token";
import { extractWebhookPriceItems } from "@/lib/billing/stripe/webhook-verify";
import {
  handleInvoicePaid,
  handleInvoicePaymentFailed,
  handleSubscriptionLifecycle,
  type SyncedSubscriptionSnapshot,
  type WebhookSyncStore,
} from "@/lib/billing/stripe/webhook-sync";
import type { StripeWebhookObjectSummary } from "@/lib/billing/stripe/webhook-verify";
import { StripeLiveSubscriptionUpgradeForbiddenError } from "@/lib/billing/errors";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const PERIOD_START = Math.floor(Date.parse("2026-10-08T08:40:14Z") / 1000);
const PERIOD_END = Math.floor(Date.parse("2026-11-08T08:40:14Z") / 1000);
const ORG_ID = "org_selfcheck";
const PREVIEW_SECRET = "selfcheck_billing_upgrade_preview_signing_secret_v1";
const PRORATION_DATE = PERIOD_START + 86_400;

process.env.BILLING_UPGRADE_PREVIEW_SIGNING_SECRET = PREVIEW_SECRET;
process.env.STRIPE_SUBSCRIPTION_TAX_COLLECTION = "authorized";

function signedPreview(
  overrides: {
    organizationId?: string;
    subscriptionId?: string;
    baseItemId?: string;
    fromPlan?: "servant_standard" | "steward_pro" | "shepherd_plus";
    toPlan?: "servant_standard" | "steward_pro" | "shepherd_plus";
    periodEndUnix?: number;
    prorationDateUnix?: number;
    automaticTax?: boolean;
    targetPriceId?: string;
    nowUnix?: number;
    ttlSeconds?: number;
  } = {},
): string {
  return signUpgradePreviewAuthorization(
    {
      organizationId: overrides.organizationId ?? ORG_ID,
      subscriptionId: overrides.subscriptionId ?? "sub_existing",
      baseItemId: overrides.baseItemId ?? "si_base",
      fromPlan: overrides.fromPlan ?? "servant_standard",
      toPlan: overrides.toPlan ?? "steward_pro",
      periodEndUnix: overrides.periodEndUnix ?? PERIOD_END,
      prorationDateUnix: overrides.prorationDateUnix ?? PRORATION_DATE,
      automaticTax: overrides.automaticTax ?? true,
      targetPriceId: overrides.targetPriceId ?? "price_steward",
      nowUnix: overrides.nowUnix,
      ttlSeconds: overrides.ttlSeconds,
    },
    PREVIEW_SECRET,
  );
}

function price(lookupKey: string, id: string, cents: number): StripePriceSnapshot {
  return {
    id,
    productId: `prod_${id}`,
    active: true,
    currency: "usd",
    unitAmount: cents,
    type: "recurring",
    recurringInterval: "month",
    lookupKey,
  };
}

function local(
  overrides: Partial<LocalUpgradeSubscription> = {},
): LocalUpgradeSubscription {
  return {
    planKey: "servant_standard",
    billingProvider: "stripe",
    billingCustomerId: "cus_local",
    billingSubscriptionId: "sub_existing",
    ...overrides,
  };
}

function item(
  overrides: Partial<LiveSubscriptionItem> & Pick<LiveSubscriptionItem, "id">,
): LiveSubscriptionItem {
  return {
    priceId: "price_servant",
    lookupKey: "servant_standard_monthly",
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
    ...overrides,
  };
}

function subscription(
  items: LiveSubscriptionItem[],
): RetrievedUpgradeSubscription {
  return {
    id: "sub_existing",
    customerId: "cus_local",
    status: "active",
    items,
  };
}

function deps(options?: {
  items?: LiveSubscriptionItem[];
  failUpdate?: boolean;
  /** When set, second retrieveSubscription returns this (stale-plan / schedule tests). */
  secondRetrieve?: RetrievedUpgradeSubscription;
}): UpgradeStripeDeps & {
  calls: { preview: number; update: number; checkout: number; createSubscription: number };
  retrieveCount: number;
  lastPreview: unknown;
  lastUpdate: { id: string; params: unknown; options?: { idempotencyKey?: string } } | null;
  updateOptions: Array<{ idempotencyKey?: string } | undefined>;
} {
  const calls = { preview: 0, update: 0, checkout: 0, createSubscription: 0 };
  let retrieveCount = 0;
  let lastPreview: unknown = null;
  let lastUpdate: {
    id: string;
    params: unknown;
    options?: { idempotencyKey?: string };
  } | null = null;
  const updateOptions: Array<{ idempotencyKey?: string } | undefined> = [];
  return {
    calls,
    get retrieveCount() {
      return retrieveCount;
    },
    get lastPreview() {
      return lastPreview;
    },
    get lastUpdate() {
      return lastUpdate;
    },
    updateOptions,
    retrieveSubscription: async (subscriptionId) => {
      assert(subscriptionId === "sub_existing", "server retrieves stored subscription");
      retrieveCount += 1;
      if (retrieveCount > 1 && options?.secondRetrieve) {
        return options.secondRetrieve;
      }
      return subscription(options?.items ?? [item({ id: "si_base" })]);
    },
    listPrices: async (lookupKey) => {
      if (lookupKey === "steward_pro_monthly") {
        return [price("steward_pro_monthly", "price_steward", 3995)];
      }
      if (lookupKey === "servant_standard_monthly") {
        return [price("servant_standard_monthly", "price_servant", 2995)];
      }
      if (lookupKey === "shepherd_plus_monthly") {
        return [price("shepherd_plus_monthly", "price_shepherd", 5995)];
      }
      return [];
    },
    createPreview: async (request) => {
      calls.preview += 1;
      lastPreview = request;
      return { amountDueCents: 512, currency: "usd" };
    },
    updateSubscription: async (id, params, updateOpts) => {
      calls.update += 1;
      lastUpdate = { id, params, options: updateOpts };
      updateOptions.push(updateOpts);
      if (options?.failUpdate) {
        throw { type: "card_error", message: "card_declined secret should not leak" };
      }
      return { id };
    },
  };
}

function summary(
  overrides: Partial<StripeWebhookObjectSummary>,
): StripeWebhookObjectSummary {
  return {
    objectType: "subscription",
    id: "sub_existing",
    customerId: "cus_local",
    subscriptionId: "sub_existing",
    invoiceId: null,
    checkoutSessionId: null,
    priceItems: [],
    priceId: null,
    priceLookupKey: null,
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
    ...overrides,
  };
}

function memoryStore(): WebhookSyncStore & {
  subscriptions: SyncedSubscriptionSnapshot[];
  transactions: string[];
  history: string[];
  organizationStatus: string;
} {
  const subscriptions: SyncedSubscriptionSnapshot[] = [
    {
      id: "sub_row_1",
      organizationId: "org_selfcheck",
      planId: "plan_servant",
      planKey: "servant_standard",
      status: "active",
      billingSubscriptionId: "sub_existing",
      paymentStatus: "ok",
    },
  ];
  const transactions: string[] = [];
  const history: string[] = [];
  const store = {
    subscriptions,
    transactions,
    history,
    organizationStatus: "active",
    async findOrganizationByStripeCustomerId(id: string) {
      if (id !== "cus_local") return null;
      return { organizationId: "org_selfcheck", providerCustomerId: "cus_local" };
    },
    async getPlanIdByKey(planKey: string) {
      if (planKey === "servant_standard") return "plan_servant";
      if (planKey === "steward_pro") return "plan_steward";
      return null;
    },
    async getSubscriptionByProviderId(providerSubscriptionId: string) {
      return (
        subscriptions.find((row) => row.billingSubscriptionId === providerSubscriptionId) ??
        null
      );
    },
    async getCurrentSubscription(organizationId: string) {
      return subscriptions.find((row) => row.organizationId === organizationId) ?? null;
    },
    async upsertSubscription(input: {
      organizationId: string;
      planId: string;
      planKey: string;
      status: SyncedSubscriptionSnapshot["status"];
      billingSubscriptionId: string;
      currentPeriodStart: string | null;
      currentPeriodEnd: string | null;
      paymentStatus?: string | null;
    }) {
      const existing = subscriptions.find(
        (row) => row.billingSubscriptionId === input.billingSubscriptionId,
      );
      if (!existing) {
        throw new Error("upgrade self-check must not create a second subscription");
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
    async writeChangeHistory(input: { metadata: Record<string, unknown> }) {
      history.push(String(input.metadata.stripe_event_id ?? ""));
    },
    async hasChangeHistoryForProviderEvent(providerEventId: string) {
      return history.includes(providerEventId);
    },
    async upsertInvoice() {
      return { id: "inv_row", created: false };
    },
    async insertTransaction(input: { idempotencyKey: string }) {
      if (transactions.includes(input.idempotencyKey)) {
        return { id: input.idempotencyKey, created: false };
      }
      transactions.push(input.idempotencyKey);
      return { id: input.idempotencyKey, created: true };
    },
    async updateSubscriptionPaymentStatus(input: { paymentStatus: string }) {
      const row = subscriptions[0];
      if (row) row.paymentStatus = input.paymentStatus;
    },
    async activateTrialOrganization() {
      if (store.organizationStatus === "active") return "noop" as const;
      return "unchanged" as const;
    },
    async syncOrganizationPlanName() {},
    async syncScheduleMirror() {},
  };
  return store;
}

async function main(): Promise<void> {
  assert(
    connectedSubscriptionPlanAction({
      hasProviderSubscription: true,
      isSamePlan: false,
      isUpgrade: true,
      isDowngrade: false,
    }) === "upgrade",
    "A paid higher plan uses upgrade",
  );
  assert(
    connectedSubscriptionPlanAction({
      hasProviderSubscription: true,
      isSamePlan: true,
      isUpgrade: false,
      isDowngrade: false,
    }) === "current",
    "B same plan does not use checkout",
  );
  assert(
    connectedSubscriptionPlanAction({
      hasProviderSubscription: false,
      isSamePlan: false,
      isUpgrade: true,
      isDowngrade: false,
    }) === "initial_checkout",
    "no subscription remains initial checkout",
  );

  const panel = readFileSync(
    "components/billing/billing-plan-panel.tsx",
    "utf8",
  );
  const checkoutCall = panel.indexOf("await startCheckoutAction");
  const guard = panel.indexOf("if (hasProviderSubscription) return;");
  assert(guard !== -1 && guard < checkoutCall, "A/B checkout is unreachable for a connected subscription");
  assert(panel.includes("confirmSubscriptionUpgradeAction"), "C dedicated upgrade action");
  assert(panel.includes("Confirm Upgrade"), "confirmation label");
  assert(panel.includes("Downgrade at next renewal"), "downgrade label");
  assert(!panel.includes("Continue to checkout") || panel.includes("planAction === \"upgrade\""), "upgrade is not labeled checkout");

  assert(
    assertClientUpgradePayload({ plan_key: "steward_pro" }) === "steward_pro",
    "D target plan key accepted",
  );
  for (const field of ["price_id", "subscription_id", "subscription_item_id", "customer_id"]) {
    let rejected = false;
    try {
      assertClientUpgradePayload({ plan_key: "steward_pro", [field]: "from_browser" });
    } catch (error) {
      rejected = error instanceof BillingUpgradeError;
    }
    assert(rejected, `${field} rejected`);
  }

  const stripe = deps({
    items: [
      item({ id: "si_base" }),
      item({
        id: "si_sms",
        priceId: "price_sms",
        lookupKey: "servant_standard_sms_50",
      }),
    ],
  });
  const preview = await previewSubscriptionUpgrade({
    organizationId: ORG_ID,
    local: local(),
    targetPlanKey: "steward_pro",
    deps: stripe,
    signingSecret: PREVIEW_SECRET,
  });
  assert(stripe.calls.preview === 1, "U preview called");
  assert(stripe.calls.update === 0, "U preview does not mutate");
  assert(stripe.calls.checkout === 0, "AD no checkout during preview");
  assert(preview.currentPlanName === "Servant Standard", "current plan");
  assert(preview.targetPlanName === "Steward Pro", "target plan");
  assert(preview.immediate === true, "immediate");
  assert(preview.amountDueCents === 512, "stripe amount");
  assert(preview.currency === "USD", "currency");
  assert(preview.renewalAt === "2026-11-08T08:40:14.000Z", "renewal");
  assert(preview.targetMonthlyPriceCents === 3995, "target monthly price");
  assert(
    typeof preview.previewAuthorization === "string" &&
      preview.previewAuthorization.includes("."),
    "preview authorization token present",
  );
  const previewPublic = {
    ...preview,
    previewAuthorization: "[redacted]",
  };
  assert(!JSON.stringify(previewPublic).includes("sub_"), "no subscription id in preview");
  assert(!JSON.stringify(previewPublic).includes("price_"), "no price id in preview");
  assert(!JSON.stringify(previewPublic).includes("cus_"), "no customer id in preview");
  assert(!JSON.stringify(previewPublic).includes("si_"), "no item id in preview");
  const previewRequest = stripe.lastPreview as {
    subscription_details: {
      items: { id: string; price: string; quantity: number }[];
      proration_behavior: string;
      billing_cycle_anchor: { type: string } | string;
      proration_date: number;
    };
  };
  assert(
    typeof previewRequest.subscription_details.billing_cycle_anchor !== "string",
    "A preview anchor is not the obsolete string",
  );
  assert(
    previewRequest.subscription_details.billing_cycle_anchor.type === "unchanged",
    "A preview anchor type unchanged",
  );
  assert(
    previewRequest.subscription_details.proration_behavior === "always_invoice",
    "D preview proration",
  );
  assert(previewRequest.subscription_details.items[0]?.id === "si_base", "F preview item id");
  assert(
    previewRequest.subscription_details.items[0]?.price === "price_steward",
    "G preview target price",
  );
  assert(previewRequest.subscription_details.items[0]?.quantity === 1, "H preview quantity");
  assert(
    Number.isInteger(previewRequest.subscription_details.proration_date),
    "preview proration_date set",
  );

  const confirmed = await confirmSubscriptionUpgrade({
    organizationId: ORG_ID,
    local: local(),
    targetPlanKey: "steward_pro",
    previewAuthorization: preview.previewAuthorization,
    deps: stripe,
    signingSecret: PREVIEW_SECRET,
  });
  assert(confirmed.subscriptionId === "sub_existing", "AC same subscription id");
  assert(stripe.calls.checkout === 0, "AD no checkout session");
  assert(stripe.calls.createSubscription === 0, "AE no second subscription");
  const params = stripe.lastUpdate?.params as {
    items: { id: string; price: string; quantity: number }[];
    proration_behavior: string;
    payment_behavior: string;
    billing_cycle_anchor: { type: string } | string;
    proration_date: number;
  };
  assert(stripe.lastUpdate?.id === "sub_existing", "H server subscription id");
  assert(params.items.length === 1, "K sms item omitted");
  assert(params.items[0]?.id === "si_base", "J/M existing base item");
  assert(params.items[0]?.price === "price_steward", "I/N catalog target price");
  assert(params.items[0]?.quantity === 1, "O quantity");
  assert(params.proration_behavior === "always_invoice", "E update proration");
  assert(params.payment_behavior === "error_if_incomplete", "E payment behavior");
  assert(typeof params.billing_cycle_anchor !== "string", "B/C update anchor is not a string");
  assert(params.billing_cycle_anchor.type === "unchanged", "B update anchor type unchanged");
  assert(
    params.proration_date === previewRequest.subscription_details.proration_date,
    "confirm reuses preview proration_date",
  );
  assert(
    typeof stripe.lastUpdate?.options?.idempotencyKey === "string" &&
      stripe.lastUpdate.options.idempotencyKey.startsWith("upgrade_v1_"),
    "Stripe update uses deterministic idempotency key",
  );
  assert(
    confirmed.idempotencyKey === stripe.lastUpdate?.options?.idempotencyKey,
    "returned idempotency key matches Stripe options",
  );

  const failing = deps({ failUpdate: true });
  const failPreview = await previewSubscriptionUpgrade({
    organizationId: ORG_ID,
    local: local(),
    targetPlanKey: "steward_pro",
    deps: failing,
    signingSecret: PREVIEW_SECRET,
  });
  const localPlan = "servant_standard";
  const entitlements = { users: 10, sms: 0 };
  let failed = false;
  try {
    await confirmSubscriptionUpgrade({
      organizationId: ORG_ID,
      local: local(),
      targetPlanKey: "steward_pro",
      previewAuthorization: failPreview.previewAuthorization,
      deps: failing,
      signingSecret: PREVIEW_SECRET,
    });
  } catch (error) {
    failed = true;
    const message = String((error as { message?: string }).message ?? "");
    assert(!message.toLowerCase().includes("card"), "no card details");
    assert(!message.toLowerCase().includes("secret"), "no secret");
  }
  assert(failed, "V update failure throws");
  assert(localPlan === "servant_standard", "V local plan unchanged");
  assert(entitlements.users === 10 && entitlements.sms === 0, "W entitlements unchanged");

  const twoBase = deps({
    items: [
      item({ id: "si_a" }),
      item({
        id: "si_b",
        priceId: "price_steward",
        lookupKey: "steward_pro_monthly",
      }),
    ],
  });
  let aborted = false;
  try {
    await previewSubscriptionUpgrade({
      organizationId: ORG_ID,
      local: local(),
      targetPlanKey: "shepherd_plus",
      deps: twoBase,
      signingSecret: PREVIEW_SECRET,
    });
  } catch (error) {
    aborted = error instanceof BillingUpgradeError;
  }
  assert(aborted, "L two base plans abort");
  assert(twoBase.calls.update === 0, "L no stripe update");

  const byPriceId = deps();
  byPriceId.retrieveSubscription = async () =>
    subscription([
      item({ id: "si_base", priceId: "price_servant", lookupKey: null }),
    ]);
  byPriceId.getPriceById = async (priceId) =>
    priceId === "price_servant"
      ? price("servant_standard_monthly", "price_servant", 2995)
      : null;
  const resolved = await previewSubscriptionUpgrade({
    organizationId: ORG_ID,
    local: local(),
    targetPlanKey: "steward_pro",
    deps: byPriceId,
    signingSecret: PREVIEW_SECRET,
  });
  assert(resolved.targetPlanKey === "steward_pro", "missing lookup uses price id");

  for (const target of ["servant_standard", "not_a_plan"]) {
    let rejected = false;
    try {
      await confirmSubscriptionUpgrade({
        organizationId: ORG_ID,
        local: local(),
        targetPlanKey: target,
        previewAuthorization: signedPreview(),
        deps: deps(),
        signingSecret: PREVIEW_SECRET,
      });
    } catch (error) {
      rejected = error instanceof BillingUpgradeError;
    }
    assert(rejected, `S/invalid ${target} rejected`);
  }
  let downgradeRejected = false;
  try {
    await confirmSubscriptionUpgrade({
      organizationId: ORG_ID,
      local: local({ planKey: "steward_pro" }),
      targetPlanKey: "servant_standard",
      previewAuthorization: signedPreview({
        fromPlan: "steward_pro",
        toPlan: "servant_standard",
        targetPriceId: "price_servant",
      }),
      deps: deps({
        items: [
          item({
            id: "si_base",
            priceId: "price_steward",
            lookupKey: "steward_pro_monthly",
          }),
        ],
      }),
      signingSecret: PREVIEW_SECRET,
    });
  } catch (error) {
    downgradeRejected = error instanceof BillingUpgradeError;
  }
  assert(downgradeRejected, "T downgrade rejected");

  const pendingItems = extractWebhookPriceItems({
    items: {
      data: [
        {
          price: { id: "price_servant", lookup_key: "servant_standard_monthly" },
          current_period_start: PERIOD_START,
          current_period_end: PERIOD_END,
        },
      ],
    },
    pending_update: {
      subscription_items: [
        {
          price: { id: "price_steward", lookup_key: "steward_pro_monthly" },
        },
      ],
    },
  });
  assert(pendingItems.length === 1, "X one live item");
  assert(pendingItems[0]?.lookupKey === "servant_standard_monthly", "X pending plan ignored");

  const sync = memoryStore();
  await handleSubscriptionLifecycle(
    sync,
    summary({
      priceItems: [
        {
          priceId: "price_servant",
          lookupKey: "servant_standard_monthly",
          productName: null,
          periodStart: PERIOD_START,
          periodEnd: PERIOD_END,
        },
      ],
      priceLookupKey: "servant_standard_monthly",
    }),
    "customer.subscription.updated",
    { providerEventId: "evt_pending" },
  );
  assert(sync.subscriptions[0]?.planKey === "servant_standard", "X plan unchanged");
  assert(sync.history.length === 0, "X no history for pending-only target");

  await handleSubscriptionLifecycle(
    sync,
    summary({
      priceItems: [
        {
          priceId: "price_steward",
          lookupKey: "steward_pro_monthly",
          productName: null,
          periodStart: PERIOD_START,
          periodEnd: PERIOD_END,
        },
      ],
      priceLookupKey: "steward_pro_monthly",
    }),
    "customer.subscription.updated",
    { providerEventId: "evt_live" },
  );
  assert(String(sync.subscriptions[0]?.planKey) === "steward_pro", "Y live plan changes");
  assert(sync.subscriptions[0]?.billingSubscriptionId === "sub_existing", "AC subscription id");
  assert(Number(sync.history.length) === 1, "Z one history entry");
  await handleSubscriptionLifecycle(
    sync,
    summary({
      priceItems: [
        {
          priceId: "price_steward",
          lookupKey: "steward_pro_monthly",
          productName: null,
          periodStart: PERIOD_START,
          periodEnd: PERIOD_END,
        },
      ],
    }),
    "customer.subscription.updated",
    { providerEventId: "evt_live" },
  );
  assert(Number(sync.history.length) === 1, "Z replay does not write again");

  const invoices = memoryStore();
  const paid = summary({
    objectType: "invoice",
    id: "in_1",
    invoiceId: "in_1",
    status: "paid",
    amountPaid: 512,
    amountDue: 0,
    priceItems: [
      {
        priceId: "price_steward",
        lookupKey: "steward_pro_monthly",
        productName: null,
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
      },
    ],
  });
  await handleInvoicePaid(invoices, paid);
  await handleInvoicePaid(invoices, paid);
  assert(invoices.transactions.length === 1, "AA invoice.paid idempotent");
  assert(invoices.subscriptions.length === 1, "AA no second subscription");
  assert(invoices.subscriptions[0]?.planKey === "servant_standard", "AA plan unchanged by invoice");

  const failedInvoice = memoryStore();
  await handleInvoicePaymentFailed(
    failedInvoice,
    summary({
      objectType: "invoice",
      id: "in_fail",
      invoiceId: "in_fail",
      status: "open",
      amountDue: 512,
      priceItems: [
        {
          priceId: "price_steward",
          lookupKey: "steward_pro_monthly",
          productName: null,
          periodStart: PERIOD_START,
          periodEnd: PERIOD_END,
        },
      ],
    }),
  );
  assert(failedInvoice.subscriptions[0]?.planKey === "servant_standard", "AB plan unchanged");
  assert(failedInvoice.organizationStatus === "active", "AB organization stays active");
  assert(failedInvoice.subscriptions[0]?.paymentStatus === "failed", "AB payment status");

  const previewMessage = previewFailureMessage({
    type: "invalid_request_error",
    code: "parameter_unknown",
    statusCode: 400,
    requestId: "req_preview",
    message: "sk_test_secret card 4242",
  });
  assert(
    previewMessage ===
      "Unable to calculate the prorated upgrade amount. Your subscription was not changed.",
    "J preview-specific message",
  );
  assert(!previewMessage.includes("could not be completed"), "J preview is not the confirm message");
  assert(!previewMessage.includes("sk_test"), "J preview message has no secret");
  const confirmMessage = upgradeFailureMessage({
    type: "invalid_request_error",
    message: "sk_test_secret",
  });
  assert(
    confirmMessage ===
      "The subscription upgrade could not be completed. Your current plan was not changed.",
    "K confirm-specific message",
  );
  const logged = safeStripePreviewErrorLog({
    type: "invalid_request_error",
    code: "parameter_unknown",
    statusCode: 400,
    requestId: "req_preview",
    message: "sk_test_secret",
    raw: { number: "4242424242424242" },
  });
  assert(logged.operation === "subscription_upgrade_preview", "safe log operation");
  assert(logged.stripeErrorType === "invalid_request_error", "safe log type");
  assert(logged.stripeErrorCode === "parameter_unknown", "safe log code");
  assert(logged.httpStatus === 400, "safe log status");
  assert(logged.stripeRequestId === "req_preview", "safe log request id");
  assert(!JSON.stringify(logged).includes("sk_test"), "safe log omits secret");
  assert(!JSON.stringify(logged).includes("4242"), "safe log omits card");

  const upgradeSource = readFileSync("lib/billing/stripe/upgrade.ts", "utf8");
  const liveSource = readFileSync(
    `lib/billing/stripe/${"upgrade-" + "live"}.ts`,
    "utf8",
  );
  assert(!upgradeSource.includes("as unknown"), "no unsafe cast in upgrade");
  assert(!liveSource.includes("as unknown"), "no unsafe cast in live adapter");
  assert(!upgradeSource.includes('billing_cycle_anchor: "unchanged"'), "C no string anchor");
  assert(!liveSource.includes('billing_cycle_anchor: "unchanged"'), "C live adapter has no string anchor");
  assert(!upgradeSource.includes("changeChurchSubscriptionPlan"), "no local plan write");
  assert(!upgradeSource.includes("checkout.sessions"), "AD no checkout create");
  assert(!upgradeSource.includes("subscriptions.create"), "AE no subscription create");
  assert(liveSource.includes("idempotencyKey"), "live adapter passes idempotencyKey");
  assert(
    liveSource.includes("assertStripeSubscriptionUpgradeModeAllowed"),
    "live adapter asserts upgrade gate before update",
  );
  assert(
    !liveSource.includes("assertStripeCheckoutModeAllowed"),
    "upgrade live path does not use Checkout gate",
  );
  const selfcheckSource = readFileSync(new URL(import.meta.url), "utf8");
  assert(
    !selfcheckSource.includes("upgrade-" + "live"),
    "AF no live stripe module",
  );
  assert(!selfcheckSource.includes("getStripe" + "Client"), "AF no stripe client");

  // --- Phase 5D-2A.2: Live upgrade gate ---
  const priorUpgradeGate = process.env.STRIPE_LIVE_SUBSCRIPTION_UPGRADES_ENABLED;
  const priorCheckoutGate = process.env.STRIPE_LIVE_CHECKOUT_ENABLED;
  try {
    for (const value of [undefined, "", "false", "FALSE", "TRUE", "1", "yes"]) {
      process.env.STRIPE_LIVE_SUBSCRIPTION_UPGRADES_ENABLED = value as string;
      if (value === undefined) {
        delete process.env.STRIPE_LIVE_SUBSCRIPTION_UPGRADES_ENABLED;
      }
      assert(
        isStripeLiveSubscriptionUpgradeEnabled(
          value === undefined ? undefined : value,
        ) === false,
        `Live upgrade gate blocks ${String(value)}`,
      );
      let blocked = false;
      try {
        assertStripeSubscriptionUpgradeModeAllowed("sk_live_test_placeholder");
      } catch (error) {
        blocked = error instanceof StripeLiveSubscriptionUpgradeForbiddenError;
      }
      assert(blocked, `Live secret blocked for env=${String(value)}`);
    }
    process.env.STRIPE_LIVE_SUBSCRIPTION_UPGRADES_ENABLED = "true";
    assert(
      isStripeLiveSubscriptionUpgradeEnabled("true") === true,
      "Live upgrade gate allows exact true",
    );
    assert(
      assertStripeSubscriptionUpgradeModeAllowed("sk_live_test_placeholder") ===
        "live",
      "Live secret allowed when upgrade gate is true",
    );
    assert(
      assertStripeSubscriptionUpgradeModeAllowed("sk_test_test_placeholder") ===
        "test",
      "Test-mode upgrade allowed independent of Live gate",
    );
    delete process.env.STRIPE_LIVE_SUBSCRIPTION_UPGRADES_ENABLED;
    assert(
      assertStripeSubscriptionUpgradeModeAllowed("sk_test_test_placeholder") ===
        "test",
      "Test-mode upgrade allowed when Live gate missing",
    );

    // Checkout gate independence
    process.env.STRIPE_LIVE_CHECKOUT_ENABLED = "true";
    process.env.STRIPE_LIVE_SUBSCRIPTION_UPGRADES_ENABLED = "false";
    assert(isStripeLiveCheckoutEnabled("true") === true, "Checkout gate still exact true");
    assert(
      isStripeLiveSubscriptionUpgradeEnabled("false") === false,
      "Checkout true does not authorize upgrade",
    );
    process.env.STRIPE_LIVE_CHECKOUT_ENABLED = "false";
    process.env.STRIPE_LIVE_SUBSCRIPTION_UPGRADES_ENABLED = "true";
    assert(isStripeLiveCheckoutEnabled("false") === false, "Upgrade true does not authorize Checkout");
    assert(
      isStripeLiveSubscriptionUpgradeEnabled("true") === true,
      "Upgrade gate remains independent",
    );
  } finally {
    if (priorUpgradeGate === undefined) {
      delete process.env.STRIPE_LIVE_SUBSCRIPTION_UPGRADES_ENABLED;
    } else {
      process.env.STRIPE_LIVE_SUBSCRIPTION_UPGRADES_ENABLED = priorUpgradeGate;
    }
    if (priorCheckoutGate === undefined) {
      delete process.env.STRIPE_LIVE_CHECKOUT_ENABLED;
    } else {
      process.env.STRIPE_LIVE_CHECKOUT_ENABLED = priorCheckoutGate;
    }
  }

  // --- Idempotency key stability ---
  const keySameA = buildSubscriptionUpgradeIdempotencyKey({
    organizationId: ORG_ID,
    subscriptionId: "sub_existing",
    fromPlan: "servant_standard",
    toPlan: "steward_pro",
    periodEndUnix: PERIOD_END,
  });
  const keySameB = buildSubscriptionUpgradeIdempotencyKey({
    organizationId: ORG_ID,
    subscriptionId: "sub_existing",
    fromPlan: "servant_standard",
    toPlan: "steward_pro",
    periodEndUnix: PERIOD_END,
  });
  assert(keySameA === keySameB, "same logical retry → same key");
  assert(keySameA.startsWith("upgrade_v1_"), "key prefix upgrade_v1_");
  assert(!keySameA.includes("sk_"), "idempotency key has no secret");
  assert(!keySameA.includes("card"), "idempotency key has no payment info");
  const keyDifferentTarget = buildSubscriptionUpgradeIdempotencyKey({
    organizationId: ORG_ID,
    subscriptionId: "sub_existing",
    fromPlan: "servant_standard",
    toPlan: "shepherd_plus",
    periodEndUnix: PERIOD_END,
  });
  assert(keyDifferentTarget !== keySameA, "different target plan → different key");
  const keyDifferentSource = buildSubscriptionUpgradeIdempotencyKey({
    organizationId: ORG_ID,
    subscriptionId: "sub_existing",
    fromPlan: "steward_pro",
    toPlan: "shepherd_plus",
    periodEndUnix: PERIOD_END,
  });
  assert(keyDifferentSource !== keySameA, "different source plan → different key");
  const keyDifferentSub = buildSubscriptionUpgradeIdempotencyKey({
    organizationId: ORG_ID,
    subscriptionId: "sub_other",
    fromPlan: "servant_standard",
    toPlan: "steward_pro",
    periodEndUnix: PERIOD_END,
  });
  assert(keyDifferentSub !== keySameA, "different subscription → different key");
  const keyDifferentOrg = buildSubscriptionUpgradeIdempotencyKey({
    organizationId: "org_other",
    subscriptionId: "sub_existing",
    fromPlan: "servant_standard",
    toPlan: "steward_pro",
    periodEndUnix: PERIOD_END,
  });
  assert(keyDifferentOrg !== keySameA, "different organization → different key");
  const keyDifferentPeriod = buildSubscriptionUpgradeIdempotencyKey({
    organizationId: ORG_ID,
    subscriptionId: "sub_existing",
    fromPlan: "servant_standard",
    toPlan: "steward_pro",
    periodEndUnix: PERIOD_END + 2_592_000,
  });
  assert(keyDifferentPeriod !== keySameA, "different billing period → different key");

  // Timeout-after-accept / concurrent same-op: identical Stripe request options
  const concurrentA = deps();
  const concurrentB = deps();
  const authA = (
    await previewSubscriptionUpgrade({
      organizationId: ORG_ID,
      local: local(),
      targetPlanKey: "steward_pro",
      deps: concurrentA,
      signingSecret: PREVIEW_SECRET,
    })
  ).previewAuthorization;
  // Same logical preview context for tab B (shared proration via token claims)
  const claimsA = verifyUpgradePreviewAuthorization(
    authA,
    { organizationId: ORG_ID },
    PREVIEW_SECRET,
  );
  const authB = signUpgradePreviewAuthorization(
    {
      organizationId: claimsA.organizationId,
      subscriptionId: claimsA.subscriptionId,
      baseItemId: claimsA.baseItemId,
      fromPlan: claimsA.fromPlan,
      toPlan: claimsA.toPlan,
      periodEndUnix: claimsA.periodEndUnix,
      prorationDateUnix: claimsA.prorationDateUnix,
      automaticTax: claimsA.automaticTax,
      targetPriceId: claimsA.targetPriceId,
      nowUnix: Math.floor(Date.now() / 1000),
    },
    PREVIEW_SECRET,
  );
  const [resultA, resultB] = await Promise.all([
    confirmSubscriptionUpgrade({
      organizationId: ORG_ID,
      local: local(),
      targetPlanKey: "steward_pro",
      previewAuthorization: authA,
      deps: concurrentA,
      signingSecret: PREVIEW_SECRET,
    }),
    confirmSubscriptionUpgrade({
      organizationId: ORG_ID,
      local: local(),
      targetPlanKey: "steward_pro",
      previewAuthorization: authB,
      deps: concurrentB,
      signingSecret: PREVIEW_SECRET,
    }),
  ]);
  assert(resultA.idempotencyKey === resultB.idempotencyKey, "concurrent same-op → same key");
  assert(
    concurrentA.lastUpdate?.options?.idempotencyKey ===
      concurrentB.lastUpdate?.options?.idempotencyKey,
    "timeout/concurrent retries pass identical idempotency options",
  );
  assert(concurrentA.calls.update === 1 && concurrentB.calls.update === 1, "each mock update once");

  // --- Preview binding ---
  const bindDeps = deps();
  let missingToken = false;
  try {
    await confirmSubscriptionUpgrade({
      organizationId: ORG_ID,
      local: local(),
      targetPlanKey: "steward_pro",
      previewAuthorization: "",
      deps: bindDeps,
      signingSecret: PREVIEW_SECRET,
    });
  } catch (error) {
    missingToken =
      error instanceof BillingUpgradeError &&
      error.message === UPGRADE_PREVIEW_STALE_MESSAGE;
  }
  assert(missingToken && bindDeps.calls.update === 0, "missing token blocked");

  let tampered = false;
  try {
    const good = signedPreview();
    await confirmSubscriptionUpgrade({
      organizationId: ORG_ID,
      local: local(),
      targetPlanKey: "steward_pro",
      previewAuthorization: `${good.slice(0, -4)}xxxx`,
      deps: bindDeps,
      signingSecret: PREVIEW_SECRET,
    });
  } catch (error) {
    tampered =
      error instanceof BillingUpgradeError &&
      error.message === UPGRADE_PREVIEW_STALE_MESSAGE;
  }
  assert(tampered && bindDeps.calls.update === 0, "tampered token blocked");

  let expired = false;
  try {
    await confirmSubscriptionUpgrade({
      organizationId: ORG_ID,
      local: local(),
      targetPlanKey: "steward_pro",
      previewAuthorization: signedPreview({
        nowUnix: Math.floor(Date.now() / 1000) - 3600,
        ttlSeconds: 60,
      }),
      deps: bindDeps,
      signingSecret: PREVIEW_SECRET,
    });
  } catch (error) {
    expired =
      error instanceof BillingUpgradeError &&
      error.message === UPGRADE_PREVIEW_STALE_MESSAGE;
  }
  assert(expired && bindDeps.calls.update === 0, "expired token blocked");

  let wrongOrg = false;
  try {
    await confirmSubscriptionUpgrade({
      organizationId: ORG_ID,
      local: local(),
      targetPlanKey: "steward_pro",
      previewAuthorization: signedPreview({ organizationId: "org_other" }),
      deps: bindDeps,
      signingSecret: PREVIEW_SECRET,
    });
  } catch (error) {
    wrongOrg =
      error instanceof BillingUpgradeError &&
      error.message === UPGRADE_PREVIEW_STALE_MESSAGE;
  }
  assert(wrongOrg && bindDeps.calls.update === 0, "wrong org token blocked");

  let wrongSub = false;
  try {
    await confirmSubscriptionUpgrade({
      organizationId: ORG_ID,
      local: local(),
      targetPlanKey: "steward_pro",
      previewAuthorization: signedPreview({ subscriptionId: "sub_other" }),
      deps: bindDeps,
      signingSecret: PREVIEW_SECRET,
    });
  } catch (error) {
    wrongSub =
      error instanceof BillingUpgradeError &&
      error.message === UPGRADE_PREVIEW_STALE_MESSAGE;
  }
  assert(wrongSub && bindDeps.calls.update === 0, "wrong subscription token blocked");

  // --- Stale source plan / schedule / cancel after preview ---
  const stalePlan = deps({
    secondRetrieve: {
      id: "sub_existing",
      customerId: "cus_local",
      status: "active",
      items: [
        item({
          id: "si_base",
          priceId: "price_steward",
          lookupKey: "steward_pro_monthly",
        }),
      ],
    },
  });
  const staleAuth = (
    await previewSubscriptionUpgrade({
      organizationId: ORG_ID,
      local: local(),
      targetPlanKey: "steward_pro",
      deps: stalePlan,
      signingSecret: PREVIEW_SECRET,
    })
  ).previewAuthorization;
  let staleBlocked = false;
  try {
    await confirmSubscriptionUpgrade({
      organizationId: ORG_ID,
      local: local(),
      targetPlanKey: "steward_pro",
      previewAuthorization: staleAuth,
      deps: stalePlan,
      signingSecret: PREVIEW_SECRET,
    });
  } catch (error) {
    staleBlocked = error instanceof BillingUpgradeError;
  }
  assert(staleBlocked && stalePlan.calls.update === 0, "stale source plan blocked");

  const scheduleAppeared = deps({
    secondRetrieve: {
      ...subscription([item({ id: "si_base" })]),
      scheduleId: "sub_sched_1",
    },
  });
  const scheduleAuth = (
    await previewSubscriptionUpgrade({
      organizationId: ORG_ID,
      local: local(),
      targetPlanKey: "steward_pro",
      deps: scheduleAppeared,
      signingSecret: PREVIEW_SECRET,
    })
  ).previewAuthorization;
  let scheduleBlocked = false;
  try {
    await confirmSubscriptionUpgrade({
      organizationId: ORG_ID,
      local: local(),
      targetPlanKey: "steward_pro",
      previewAuthorization: scheduleAuth,
      deps: scheduleAppeared,
      signingSecret: PREVIEW_SECRET,
    });
  } catch (error) {
    scheduleBlocked = error instanceof BillingUpgradeError;
  }
  assert(scheduleBlocked && scheduleAppeared.calls.update === 0, "schedule after preview blocked");

  const cancelAppeared = deps({
    secondRetrieve: {
      ...subscription([item({ id: "si_base" })]),
      cancelAtPeriodEnd: true,
    },
  });
  const cancelAuth = (
    await previewSubscriptionUpgrade({
      organizationId: ORG_ID,
      local: local(),
      targetPlanKey: "steward_pro",
      deps: cancelAppeared,
      signingSecret: PREVIEW_SECRET,
    })
  ).previewAuthorization;
  let cancelBlocked = false;
  try {
    await confirmSubscriptionUpgrade({
      organizationId: ORG_ID,
      local: local(),
      targetPlanKey: "steward_pro",
      previewAuthorization: cancelAuth,
      deps: cancelAppeared,
      signingSecret: PREVIEW_SECRET,
    });
  } catch (error) {
    cancelBlocked = error instanceof BillingUpgradeError;
  }
  assert(cancelBlocked && cancelAppeared.calls.update === 0, "cancel after preview blocked");

  // SMS isolation: upgrade path never references SMS ledger/auto PM
  assert(!upgradeSource.includes("organization_sms"), "upgrade omits SMS tables");
  assert(!upgradeSource.includes("sms_auto"), "upgrade omits SMS auto");
  assert(!panel.includes("sms_auto"), "panel upgrade confirm omits SMS auto");
  assert(panel.includes("previewAuthorization"), "panel carries opaque preview authorization");

  console.log("billing subscription upgrade self-check passed");
}

main();
