/**
 * Immediate upgrades of an existing Stripe subscription.
 * Checkout stays initial-purchase only. Downgrades are refused here.
 * The webhook remains the only writer of organization_subscriptions.plan_id.
 */

import {
  commercialExpectationByInternalKey,
  type CommercialPriceExpectation,
} from "@/lib/billing/commercial-catalog";
import { BillingUpgradeError } from "@/lib/billing/errors";
import { matchStripePriceToExpectation } from "@/lib/billing/stripe/catalog";
import type { ListPricesByLookupKey } from "@/lib/billing/stripe/catalog";
import {
  resolveApprovedSubscriptionPlanFromItems,
  type GetStripePriceById,
  type WebhookPriceItemRef,
} from "@/lib/billing/stripe/plan-correlation";
import { isPlanDowngrade, isPlanUpgrade } from "@/lib/subscriptions/status";
import { DOWNGRADE_UPGRADE_CONFLICT_MESSAGE } from "@/lib/billing/stripe/downgrade";
import {
  isPlanKey,
  PLAN_DISPLAY_NAMES,
  type PlanKey,
} from "@/lib/subscriptions/plan-keys";
import type Stripe from "stripe";

export const UPGRADE_PRORATION_BEHAVIOR = "always_invoice" as const;
export const UPGRADE_PAYMENT_BEHAVIOR = "error_if_incomplete" as const;
/** Endive billing-cycle anchor: object form, not the obsolete string. */
export const UPGRADE_BILLING_CYCLE_ANCHOR = {
  type: "unchanged",
} as const satisfies Stripe.SubscriptionUpdateParams.BillingCycleAnchor &
  Stripe.InvoiceCreatePreviewParams.SubscriptionDetails.BillingCycleAnchor;

export const UPGRADE_PREVIEW_FAILURE_MESSAGE =
  "Unable to calculate the prorated upgrade amount. Your subscription was not changed.";

const UPGRADE_CREDIT_STATEMENT =
  "Stripe will apply credit for unused time on your current plan and calculate the prorated amount due today.";

const FORBIDDEN_CLIENT_FIELDS = [
  "price_id",
  "priceId",
  "subscription_id",
  "subscriptionId",
  "subscription_item_id",
  "subscriptionItemId",
  "item_id",
  "itemId",
  "customer_id",
  "customerId",
] as const;

const LIVE_UPGRADE_STATUSES = new Set(["active", "trialing", "past_due"]);

export type LiveSubscriptionItem = {
  id: string;
  priceId: string | null;
  lookupKey: string | null;
  periodStart: number | null;
  periodEnd: number | null;
};

export type RetrievedUpgradeSubscription = {
  id: string;
  customerId: string;
  status: string;
  items: LiveSubscriptionItem[];
  scheduleId?: string | null;
};

export type LocalUpgradeSubscription = {
  planKey: string;
  billingProvider: string | null;
  billingCustomerId: string;
  billingSubscriptionId: string;
  /** True when a downgrade schedule is still pending. */
  activeDowngradeSchedule?: boolean;
};

export type SubscriptionUpgradePreview = {
  currentPlanKey: PlanKey;
  currentPlanName: string;
  targetPlanKey: PlanKey;
  targetPlanName: string;
  immediate: true;
  amountDueCents: number;
  currency: string;
  renewalAt: string;
  targetMonthlyPriceCents: number;
  creditStatement: string;
};

export type SubscriptionUpgradeUpdate = {
  subscriptionId: string;
  params: {
    items: [{ id: string; price: string; quantity: 1 }];
    proration_behavior: typeof UPGRADE_PRORATION_BEHAVIOR;
    payment_behavior: typeof UPGRADE_PAYMENT_BEHAVIOR;
    billing_cycle_anchor: typeof UPGRADE_BILLING_CYCLE_ANCHOR;
  };
};

export type SubscriptionUpgradePreviewRequest = {
  customer: string;
  subscription: string;
  subscription_details: {
    items: [{ id: string; price: string; quantity: 1 }];
    proration_behavior: typeof UPGRADE_PRORATION_BEHAVIOR;
    billing_cycle_anchor: typeof UPGRADE_BILLING_CYCLE_ANCHOR;
  };
};

export type PreparedSubscriptionUpgrade = {
  update: SubscriptionUpgradeUpdate;
  previewRequest: SubscriptionUpgradePreviewRequest;
  currentPlanKey: PlanKey;
  targetPlanKey: PlanKey;
  renewalAt: string;
  targetMonthlyPriceCents: number;
  baseItemId: string;
  targetPriceId: string;
};

export type UpgradeStripeDeps = {
  retrieveSubscription: (subscriptionId: string) => Promise<RetrievedUpgradeSubscription>;
  listPrices: ListPricesByLookupKey;
  getPriceById?: GetStripePriceById;
  createPreview: (
    request: SubscriptionUpgradePreviewRequest,
  ) => Promise<{ amountDueCents: number | null; currency: string | null }>;
  updateSubscription: (
    subscriptionId: string,
    params: SubscriptionUpgradeUpdate["params"],
  ) => Promise<{ id: string }>;
};

export function assertClientUpgradePayload(
  fields: Record<string, unknown>,
): string {
  for (const key of FORBIDDEN_CLIENT_FIELDS) {
    const value = fields[key];
    if (typeof value === "string" && value.trim()) {
      throw new BillingUpgradeError(
        "Plan changes accept only the target plan. Stripe identifiers are resolved on the server.",
      );
    }
  }
  const target = typeof fields.plan_key === "string" ? fields.plan_key.trim() : "";
  if (!target) {
    throw new BillingUpgradeError("Choose a plan to upgrade.");
  }
  return target;
}

export function previewFailureMessage(error: unknown): string {
  if (error instanceof BillingUpgradeError) return error.message;
  return UPGRADE_PREVIEW_FAILURE_MESSAGE;
}

export function safeStripePreviewErrorLog(error: unknown): {
  operation: "subscription_upgrade_preview";
  stripeErrorType: string | null;
  stripeErrorCode: string | null;
  httpStatus: number | null;
  stripeRequestId: string | null;
} {
  const record =
    error && typeof error === "object" ? (error as Record<string, unknown>) : {};
  return {
    operation: "subscription_upgrade_preview",
    stripeErrorType: typeof record.type === "string" ? record.type : null,
    stripeErrorCode: typeof record.code === "string" ? record.code : null,
    httpStatus: typeof record.statusCode === "number" ? record.statusCode : null,
    stripeRequestId: typeof record.requestId === "string" ? record.requestId : null,
  };
}

export function upgradeFailureMessage(error: unknown): string {
  if (error instanceof BillingUpgradeError) return error.message;
  const type =
    error && typeof error === "object" && "type" in error
      ? String((error as { type?: unknown }).type ?? "")
      : "";
  if (type === "card_error" || type === "StripeCardError") {
    return "The upgrade payment could not be collected. Your current plan was not changed.";
  }
  return "The subscription upgrade could not be completed. Your current plan was not changed.";
}

export function buildSubscriptionUpgradeUpdate(input: {
  subscriptionId: string;
  baseItemId: string;
  targetPriceId: string;
}): SubscriptionUpgradeUpdate {
  const subscriptionId = input.subscriptionId.trim();
  const baseItemId = input.baseItemId.trim();
  const targetPriceId = input.targetPriceId.trim();
  if (!subscriptionId || !baseItemId || !targetPriceId) {
    throw new BillingUpgradeError("The existing subscription could not be prepared for upgrade.");
  }
  return {
    subscriptionId,
    params: {
      items: [{ id: baseItemId, price: targetPriceId, quantity: 1 }],
      proration_behavior: UPGRADE_PRORATION_BEHAVIOR,
      payment_behavior: UPGRADE_PAYMENT_BEHAVIOR,
      billing_cycle_anchor: UPGRADE_BILLING_CYCLE_ANCHOR,
    },
  };
}

export async function resolveExistingBasePlanItem(input: {
  items: LiveSubscriptionItem[];
  getPriceById?: GetStripePriceById;
}): Promise<{
  itemId: string;
  planKey: PlanKey;
  lookupKey: string;
  priceId: string | null;
  periodStart: number | null;
  periodEnd: number | null;
}> {
  const refs: WebhookPriceItemRef[] = input.items.map((item) => ({
    priceId: item.priceId,
    lookupKey: item.lookupKey,
    productName: null,
    periodStart: item.periodStart,
    periodEnd: item.periodEnd,
  }));
  const resolution = await resolveApprovedSubscriptionPlanFromItems(refs, {
    getPriceById: input.getPriceById,
  });
  if (!resolution.ok) {
    throw new BillingUpgradeError(
      "The subscription must have exactly one approved base plan before it can be upgraded.",
    );
  }

  const matches = input.items.filter((item) => itemMatchesResolution(item, resolution));
  if (matches.length !== 1) {
    throw new BillingUpgradeError(
      "The subscription must have exactly one approved base plan before it can be upgraded.",
    );
  }
  const item = matches[0];
  if (!item?.id.trim()) {
    throw new BillingUpgradeError(
      "The existing base-plan item could not be identified.",
    );
  }
  return {
    itemId: item.id.trim(),
    planKey: resolution.planKey,
    lookupKey: resolution.lookupKey,
    priceId: resolution.priceId,
    periodStart: item.periodStart,
    periodEnd: item.periodEnd,
  };
}

export async function prepareSubscriptionUpgrade(input: {
  local: LocalUpgradeSubscription;
  targetPlanKey: string;
  stripeSubscription: RetrievedUpgradeSubscription;
  listPrices: ListPricesByLookupKey;
  getPriceById?: GetStripePriceById;
}): Promise<PreparedSubscriptionUpgrade> {
  const provider = (input.local.billingProvider ?? "").trim().toLowerCase();
  if (provider !== "stripe") {
    throw new BillingUpgradeError("This organization is not billed through Stripe.");
  }
  const localSubscriptionId = input.local.billingSubscriptionId.trim();
  const localCustomerId = input.local.billingCustomerId.trim();
  if (!localSubscriptionId || !localCustomerId) {
    throw new BillingUpgradeError(
      "A connected Stripe subscription is required before a plan can be upgraded.",
    );
  }
  if (input.stripeSubscription.id !== localSubscriptionId) {
    throw new BillingUpgradeError(
      "The live subscription does not match this organization.",
    );
  }
  if (input.stripeSubscription.customerId !== localCustomerId) {
    throw new BillingUpgradeError(
      "The live subscription does not belong to this organization's Stripe customer.",
    );
  }
  if (!LIVE_UPGRADE_STATUSES.has(input.stripeSubscription.status)) {
    throw new BillingUpgradeError(
      "This subscription cannot be upgraded in its current status.",
    );
  }
  if (
    input.local.activeDowngradeSchedule === true ||
    Boolean((input.stripeSubscription.scheduleId ?? "").trim())
  ) {
    throw new BillingUpgradeError(DOWNGRADE_UPGRADE_CONFLICT_MESSAGE);
  }
  if (!isPlanKey(input.local.planKey)) {
    throw new BillingUpgradeError("The current plan could not be verified.");
  }

  const base = await resolveExistingBasePlanItem({
    items: input.stripeSubscription.items,
    getPriceById: input.getPriceById,
  });
  if (base.planKey !== input.local.planKey) {
    throw new BillingUpgradeError(
      "The plan on file does not match the live Stripe subscription. Refresh billing and try again.",
    );
  }
  if (base.periodEnd == null) {
    throw new BillingUpgradeError(
      "The live subscription is missing its renewal date.",
    );
  }

  const targetPlanKey = assertUpgradeTarget(input.local.planKey, input.targetPlanKey);
  const expectation = subscriptionExpectation(targetPlanKey);
  const prices = await input.listPrices(expectation.lookupKey);
  let resolved: ReturnType<typeof matchStripePriceToExpectation>;
  try {
    resolved = matchStripePriceToExpectation(prices, expectation);
  } catch {
    throw new BillingUpgradeError(
      "The selected plan is not an approved live subscription price.",
    );
  }
  if (resolved.internalKey !== targetPlanKey) {
    throw new BillingUpgradeError(
      "The selected plan is not an approved live subscription price.",
    );
  }

  const update = buildSubscriptionUpgradeUpdate({
    subscriptionId: localSubscriptionId,
    baseItemId: base.itemId,
    targetPriceId: resolved.stripePriceId,
  });

  return {
    update,
    previewRequest: {
      customer: localCustomerId,
      subscription: localSubscriptionId,
      subscription_details: {
        items: update.params.items,
        proration_behavior: UPGRADE_PRORATION_BEHAVIOR,
        billing_cycle_anchor: UPGRADE_BILLING_CYCLE_ANCHOR,
      },
    },
    currentPlanKey: input.local.planKey,
    targetPlanKey,
    renewalAt: new Date(base.periodEnd * 1000).toISOString(),
    targetMonthlyPriceCents: expectation.unitAmountCents,
    baseItemId: base.itemId,
    targetPriceId: resolved.stripePriceId,
  };
}

export function previewViewFromPrepared(
  prepared: PreparedSubscriptionUpgrade,
  amount: { amountDueCents: number | null; currency: string | null },
): SubscriptionUpgradePreview {
  if (
    amount.amountDueCents == null ||
    !Number.isInteger(amount.amountDueCents) ||
    amount.amountDueCents < 0
  ) {
    throw new BillingUpgradeError("Stripe did not return an upgrade preview amount.");
  }
  const currency = (amount.currency ?? "").trim().toUpperCase();
  if (currency !== "USD") {
    throw new BillingUpgradeError("Stripe did not return a USD upgrade preview.");
  }
  return {
    currentPlanKey: prepared.currentPlanKey,
    currentPlanName: PLAN_DISPLAY_NAMES[prepared.currentPlanKey],
    targetPlanKey: prepared.targetPlanKey,
    targetPlanName: PLAN_DISPLAY_NAMES[prepared.targetPlanKey],
    immediate: true,
    amountDueCents: amount.amountDueCents,
    currency,
    renewalAt: prepared.renewalAt,
    targetMonthlyPriceCents: prepared.targetMonthlyPriceCents,
    creditStatement: UPGRADE_CREDIT_STATEMENT,
  };
}

export async function previewSubscriptionUpgrade(input: {
  local: LocalUpgradeSubscription;
  targetPlanKey: string;
  deps: UpgradeStripeDeps;
}): Promise<SubscriptionUpgradePreview> {
  const stripeSubscription = await input.deps.retrieveSubscription(
    input.local.billingSubscriptionId.trim(),
  );
  const prepared = await prepareSubscriptionUpgrade({
    local: input.local,
    targetPlanKey: input.targetPlanKey,
    stripeSubscription,
    listPrices: input.deps.listPrices,
    getPriceById: input.deps.getPriceById,
  });
  const amount = await input.deps.createPreview(prepared.previewRequest);
  return previewViewFromPrepared(prepared, amount);
}

export async function confirmSubscriptionUpgrade(input: {
  local: LocalUpgradeSubscription;
  targetPlanKey: string;
  deps: UpgradeStripeDeps;
}): Promise<{ subscriptionId: string }> {
  const stripeSubscription = await input.deps.retrieveSubscription(
    input.local.billingSubscriptionId.trim(),
  );
  const prepared = await prepareSubscriptionUpgrade({
    local: input.local,
    targetPlanKey: input.targetPlanKey,
    stripeSubscription,
    listPrices: input.deps.listPrices,
    getPriceById: input.deps.getPriceById,
  });
  let updated: { id: string };
  try {
    updated = await input.deps.updateSubscription(
      prepared.update.subscriptionId,
      prepared.update.params,
    );
  } catch (error) {
    throw new BillingUpgradeError(upgradeFailureMessage(error));
  }
  if (updated.id !== prepared.update.subscriptionId) {
    throw new BillingUpgradeError(
      "The subscription upgrade could not be completed. Your current plan was not changed.",
    );
  }
  return { subscriptionId: updated.id };
}

function assertUpgradeTarget(current: PlanKey, requested: string): PlanKey {
  const target = requested.trim();
  if (!isPlanKey(target)) {
    throw new BillingUpgradeError("Choose an approved subscription plan.");
  }
  if (target === current) {
    throw new BillingUpgradeError("You are already on this plan.");
  }
  if (isPlanDowngrade(current, target) || !isPlanUpgrade(current, target)) {
    throw new BillingUpgradeError(
      "Downgrades take effect at the next renewal and are not available yet.",
    );
  }
  return target;
}

function subscriptionExpectation(planKey: PlanKey): CommercialPriceExpectation {
  const expectation = commercialExpectationByInternalKey(planKey);
  if (!expectation || expectation.kind !== "subscription") {
    throw new BillingUpgradeError("Choose an approved subscription plan.");
  }
  return expectation;
}

function itemMatchesResolution(
  item: LiveSubscriptionItem,
  resolution: { lookupKey: string; priceId: string | null },
): boolean {
  const lookup = (item.lookupKey ?? "").trim();
  if (lookup) return lookup === resolution.lookupKey;
  return Boolean(resolution.priceId && item.priceId === resolution.priceId);
}
