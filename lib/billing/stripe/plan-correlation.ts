/**
 * Map Stripe Prices to approved Sanctuary Protected subscription plans.
 * SMS package Prices must never activate a subscription tier.
 *
 * Supports webhook payloads with lookup_key and/or Price ID only.
 * Uses the Phase 4B-2 commercial catalog — never Product names or metadata alone.
 */

import {
  commercialExpectationByLookupKey,
  listCommercialPriceExpectations,
} from "@/lib/billing/commercial-catalog";
import {
  BillingCheckoutPlanError,
  StripeCatalogMismatchError,
  StripeCatalogNotFoundError,
} from "@/lib/billing/errors";
import {
  matchStripePriceToExpectation,
  type StripePriceSnapshot,
} from "@/lib/billing/stripe/catalog";
import type { PlanKey } from "@/lib/subscriptions/plan-keys";
import { isPlanKey } from "@/lib/subscriptions/plan-keys";

export type WebhookPriceItemRef = {
  priceId: string | null;
  lookupKey: string | null;
  /** Informational only — never used for entitlement authority. */
  productName: string | null;
  /**
   * Service period from the same Stripe item or invoice line.
   * Subscription items use current_period_*; invoice lines use period.start/end.
   */
  periodStart?: number | null;
  periodEnd?: number | null;
};

export type GetStripePriceById = (
  priceId: string,
) => Promise<StripePriceSnapshot | null>;

export type ApprovedPlanResolution =
  | {
      ok: true;
      planKey: PlanKey;
      lookupKey: string;
      priceId: string | null;
      source: "lookup_key" | "price_id";
    }
  | {
      ok: false;
      code:
        | "none"
        | "ambiguous"
        | "sms"
        | "unknown"
        | "inactive"
        | "currency"
        | "amount"
        | "interval"
        | "missing_retriever"
        | "rejected";
      reason: string;
    };

export function resolvePlanKeyFromStripeLookupKey(
  lookupKey: string | null | undefined,
): PlanKey {
  const key = (lookupKey ?? "").trim();
  if (!key) {
    throw new BillingCheckoutPlanError(
      "Stripe Price is missing an approved lookup key.",
    );
  }

  const expectation = commercialExpectationByLookupKey(key);
  if (!expectation) {
    throw new BillingCheckoutPlanError(
      `Stripe lookup key "${key.slice(0, 64)}" is not in the approved commercial catalog.`,
    );
  }
  if (expectation.kind !== "subscription") {
    throw new BillingCheckoutPlanError(
      "SMS package Prices cannot activate a subscription plan.",
    );
  }
  if (!isPlanKey(expectation.internalKey)) {
    throw new BillingCheckoutPlanError("Resolved plan key is invalid.");
  }
  return expectation.internalKey;
}

/**
 * Period of the same item that resolved the approved base plan.
 * SMS package items are ignored because their lookup key does not match.
 * Disagreeing periods, or a missing period, return null so callers do not
 * invent dates or erase a stored period.
 */
export function periodForApprovedBasePlanItem(
  items: WebhookPriceItemRef[],
  approved: { lookupKey: string; priceId: string | null },
): { periodStart: number; periodEnd: number } | null {
  const lookup = approved.lookupKey.trim();
  const matches = items.filter((item) => {
    const itemLookup = (item.lookupKey ?? "").trim();
    if (itemLookup && itemLookup === lookup) return true;
    if (!itemLookup && approved.priceId && item.priceId === approved.priceId) {
      return true;
    }
    return false;
  });
  const complete = matches.filter(
    (item) =>
      typeof item.periodStart === "number" &&
      Number.isFinite(item.periodStart) &&
      typeof item.periodEnd === "number" &&
      Number.isFinite(item.periodEnd) &&
      item.periodEnd >= item.periodStart,
  );
  if (complete.length === 0) return null;
  const periodStart = complete[0]!.periodStart!;
  const periodEnd = complete[0]!.periodEnd!;
  const unanimous = complete.every(
    (item) => item.periodStart === periodStart && item.periodEnd === periodEnd,
  );
  if (!unanimous) return null;
  return { periodStart, periodEnd };
}

/**
 * Service window for an invoice that may contain several approved base-plan
 * lines, such as a proration credit and the replacement charge.
 * SMS package lines are ignored. A period is returned only when every
 * approved subscription line has the same start and end.
 */
export async function servicePeriodForApprovedSubscriptionLines(
  items: WebhookPriceItemRef[],
  getPriceById?: GetStripePriceById,
): Promise<{ periodStart: number; periodEnd: number } | null> {
  const periods: { periodStart: number; periodEnd: number }[] = [];
  for (const item of items) {
    if (!(await isApprovedSubscriptionLine(item, getPriceById))) continue;
    const periodStart = item.periodStart;
    const periodEnd = item.periodEnd;
    if (
      typeof periodStart !== "number" ||
      typeof periodEnd !== "number" ||
      !Number.isFinite(periodStart) ||
      !Number.isFinite(periodEnd) ||
      periodEnd < periodStart
    ) {
      return null;
    }
    periods.push({ periodStart, periodEnd });
  }
  if (periods.length === 0) return null;
  const window = periods[0]!;
  const unanimous = periods.every(
    (period) =>
      period.periodStart === window.periodStart &&
      period.periodEnd === window.periodEnd,
  );
  return unanimous ? window : null;
}

async function isApprovedSubscriptionLine(
  item: WebhookPriceItemRef,
  getPriceById?: GetStripePriceById,
): Promise<boolean> {
  const lookup = (item.lookupKey ?? "").trim();
  if (lookup) return isApprovedSubscriptionLookupKey(lookup);
  const priceId = (item.priceId ?? "").trim();
  if (!priceId || !getPriceById) return false;
  const snapshot = await getPriceById(priceId);
  if (!snapshot) return false;
  return resolvePlanKeyFromTrustedPriceSnapshot(snapshot).ok;
}

export function isApprovedSubscriptionLookupKey(lookupKey: string): boolean {
  return listCommercialPriceExpectations().some(
    (entry) =>
      entry.kind === "subscription" && entry.lookupKey === lookupKey.trim(),
  );
}

function classifyCatalogError(error: unknown): ApprovedPlanResolution {
  if (error instanceof BillingCheckoutPlanError) {
    const message = error.message;
    if (message.includes("SMS package")) {
      return { ok: false, code: "sms", reason: message };
    }
    if (message.includes("not in the approved")) {
      return { ok: false, code: "unknown", reason: message };
    }
    return { ok: false, code: "rejected", reason: message };
  }
  if (error instanceof StripeCatalogMismatchError) {
    const message = error.message;
    if (/inactive/i.test(message)) {
      return { ok: false, code: "inactive", reason: message };
    }
    if (/currency/i.test(message)) {
      return { ok: false, code: "currency", reason: message };
    }
    if (/unit_amount/i.test(message)) {
      return { ok: false, code: "amount", reason: message };
    }
    if (/interval|recurring|one-time/i.test(message)) {
      return { ok: false, code: "interval", reason: message };
    }
    return { ok: false, code: "rejected", reason: message };
  }
  if (error instanceof StripeCatalogNotFoundError) {
    return { ok: false, code: "unknown", reason: error.message };
  }
  if (error instanceof Error) {
    return { ok: false, code: "rejected", reason: error.message };
  }
  return { ok: false, code: "rejected", reason: "Price correlation failed." };
}

/**
 * Validate a trusted Price snapshot against the approved subscription catalog.
 * Requires the snapshot's lookup_key (from Stripe) and full commercial checks.
 */
export function resolvePlanKeyFromTrustedPriceSnapshot(
  snapshot: StripePriceSnapshot,
): ApprovedPlanResolution {
  const lookupKey = (snapshot.lookupKey ?? "").trim();
  if (!lookupKey) {
    return {
      ok: false,
      code: "unknown",
      reason: "Retrieved Stripe Price is missing an approved lookup key.",
    };
  }

  const expectation = commercialExpectationByLookupKey(lookupKey);
  if (!expectation) {
    return {
      ok: false,
      code: "unknown",
      reason: `Stripe lookup key "${lookupKey.slice(0, 64)}" is not in the approved commercial catalog.`,
    };
  }
  if (expectation.kind !== "subscription") {
    return {
      ok: false,
      code: "sms",
      reason: "SMS package Prices cannot activate a subscription plan.",
    };
  }

  try {
    const resolved = matchStripePriceToExpectation([snapshot], expectation);
    if (!isPlanKey(resolved.internalKey)) {
      return { ok: false, code: "rejected", reason: "Resolved plan key is invalid." };
    }
    return {
      ok: true,
      planKey: resolved.internalKey,
      lookupKey: resolved.lookupKey,
      priceId: resolved.stripePriceId,
      source: "price_id",
    };
  } catch (error) {
    return classifyCatalogError(error);
  }
}

async function resolveOneItem(
  item: WebhookPriceItemRef,
  getPriceById?: GetStripePriceById,
): Promise<ApprovedPlanResolution | null> {
  // Product name is intentionally ignored for entitlement authority.
  void item.productName;

  const lookupKey = (item.lookupKey ?? "").trim();
  if (lookupKey) {
    try {
      const planKey = resolvePlanKeyFromStripeLookupKey(lookupKey);
      return {
        ok: true,
        planKey,
        lookupKey,
        priceId: item.priceId,
        source: "lookup_key",
      };
    } catch (error) {
      // Non-base / rejected item — skip for multi-item aggregation
      const classified = classifyCatalogError(error);
      if (classified.ok === false && (classified.code === "sms" || classified.code === "unknown")) {
        return classified;
      }
      return classified;
    }
  }

  const priceId = (item.priceId ?? "").trim();
  if (!priceId) {
    return null;
  }

  if (!getPriceById) {
    return {
      ok: false,
      code: "missing_retriever",
      reason:
        "Stripe Price ID present without lookup_key; server Price retrieval is unavailable.",
    };
  }

  const snapshot = await getPriceById(priceId);
  if (!snapshot) {
    return {
      ok: false,
      code: "unknown",
      reason: "Stripe Price ID was not found.",
    };
  }

  return resolvePlanKeyFromTrustedPriceSnapshot(snapshot);
}

/**
 * Resolve exactly one approved base subscription plan from webhook price items.
 *
 * - 1 approved base-plan Price → synchronize that plan
 * - 0 approved base-plan Prices → do not grant/change plan entitlement
 * - >1 distinct approved base-plan Prices → ambiguous conflict; no mutation
 */
export async function resolveApprovedSubscriptionPlanFromItems(
  items: WebhookPriceItemRef[],
  options: { getPriceById?: GetStripePriceById } = {},
): Promise<ApprovedPlanResolution> {
  const refs =
    items.length > 0
      ? items
      : [{ priceId: null, lookupKey: null, productName: null }];

  const approved = new Map<
    PlanKey,
    Extract<ApprovedPlanResolution, { ok: true }>
  >();
  let lastRejection: ApprovedPlanResolution | null = null;

  for (const item of refs) {
    const result = await resolveOneItem(item, options.getPriceById);
    if (!result) continue;
    if (result.ok) {
      approved.set(result.planKey, result);
      continue;
    }
    // Keep the most specific rejection for diagnostics when nothing approves.
    lastRejection = result;
  }

  if (approved.size === 1) {
    return [...approved.values()][0]!;
  }
  if (approved.size > 1) {
    return {
      ok: false,
      code: "ambiguous",
      reason:
        "Subscription contains more than one approved Sanctuary Protected base-plan Price.",
    };
  }

  if (lastRejection && lastRejection.ok === false) {
    return lastRejection;
  }

  return {
    ok: false,
    code: "none",
    reason: "No approved Sanctuary Protected base-plan Price found on subscription.",
  };
}
