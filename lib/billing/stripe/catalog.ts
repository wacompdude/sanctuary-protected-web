/**
 * Stripe commercial catalog / Price resolution (Phase 4B-2).
 *
 * Resolves internal plan/item keys → approved lookup keys → verified Stripe Prices.
 * Pure validation + injectable price listing seam (no network in Stage A tests).
 * Live Stripe listing lives in catalog-stripe.ts (server-only).
 *
 * Never hard-code price_/prod_ IDs. Never trust browser-supplied Price IDs.
 */

import {
  commercialExpectationByInternalKey,
  listCommercialPriceExpectations,
  type CommercialPriceExpectation,
  type CommercialPriceKind,
} from "@/lib/billing/commercial-catalog";
import {
  BillingConfigurationError,
  StripeCatalogAmbiguousError,
  StripeCatalogMismatchError,
  StripeCatalogNotFoundError,
  StripeLiveModeForbiddenError,
  StripeUnknownModeForbiddenError,
} from "@/lib/billing/errors";
import {
  classifyStripeSecretMode,
  type StripeSecretMode,
} from "@/lib/billing/stripe/config";

/** Sanitized Price snapshot from Stripe (or mocks). No secret material. */
export type StripePriceSnapshot = {
  id: string;
  productId: string;
  active: boolean;
  currency: string;
  unitAmount: number | null;
  type: "one_time" | "recurring";
  recurringInterval: "day" | "week" | "month" | "year" | null;
  lookupKey: string | null;
};

export type ListPricesByLookupKey = (
  lookupKey: string,
) => Promise<StripePriceSnapshot[]>;

/** Sanitized resolved Price for the billing layer. */
export type ResolvedStripePrice = {
  internalKey: string;
  kind: CommercialPriceKind;
  lookupKey: string;
  stripePriceId: string;
  stripeProductId: string;
  currency: string;
  unitAmountCents: number;
  active: boolean;
  priceType: "one_time" | "recurring";
  recurringInterval: string | null;
  smsCredits: number | null;
};

export type CatalogEntryValidationResult = {
  internalKey: string;
  kind: CommercialPriceKind;
  lookupKey: string;
  ok: boolean;
  errorCode: string | null;
  errorMessage: string | null;
  resolved: ResolvedStripePrice | null;
};

export type StripeCommercialCatalogValidationReport = {
  valid: boolean;
  mode: StripeSecretMode;
  entriesChecked: number;
  entries: CatalogEntryValidationResult[];
  errors: string[];
};

function normalizeCurrency(currency: string): string {
  return currency.trim().toLowerCase();
}

/**
 * Validate a single Stripe Price snapshot against an approved expectation.
 * Throws typed catalog errors on failure.
 */
export function matchStripePriceToExpectation(
  prices: StripePriceSnapshot[],
  expectation: CommercialPriceExpectation,
): ResolvedStripePrice {
  const lookupKey = expectation.lookupKey;

  if (prices.length === 0) {
    throw new StripeCatalogNotFoundError(lookupKey);
  }
  if (prices.length > 1) {
    throw new StripeCatalogAmbiguousError(lookupKey, prices.length);
  }

  const price = prices[0]!;

  if (!price.active) {
    throw new StripeCatalogMismatchError(lookupKey, "Price is inactive");
  }

  if (normalizeCurrency(price.currency) !== expectation.currency) {
    throw new StripeCatalogMismatchError(
      lookupKey,
      `expected currency ${expectation.currency}, got ${normalizeCurrency(price.currency) || "(empty)"}`,
    );
  }

  if (price.unitAmount === null || price.unitAmount === undefined) {
    throw new StripeCatalogMismatchError(
      lookupKey,
      "Price is missing unit_amount",
    );
  }

  if (price.unitAmount !== expectation.unitAmountCents) {
    throw new StripeCatalogMismatchError(
      lookupKey,
      `expected unit_amount ${expectation.unitAmountCents}, got ${price.unitAmount}`,
    );
  }

  if (expectation.billingScheme === "recurring_month") {
    if (price.type !== "recurring") {
      throw new StripeCatalogMismatchError(
        lookupKey,
        `expected recurring subscription Price, got ${price.type}`,
      );
    }
    if (price.recurringInterval !== "month") {
      throw new StripeCatalogMismatchError(
        lookupKey,
        `expected recurring.interval=month, got ${price.recurringInterval ?? "(none)"}`,
      );
    }
  } else {
    if (price.type !== "one_time") {
      throw new StripeCatalogMismatchError(
        lookupKey,
        `expected one-time SMS package Price, got ${price.type}`,
      );
    }
    if (price.recurringInterval) {
      throw new StripeCatalogMismatchError(
        lookupKey,
        `one-time Price must not have recurring.interval (got ${price.recurringInterval})`,
      );
    }
  }

  if (!price.id.trim() || !price.productId.trim()) {
    throw new StripeCatalogMismatchError(
      lookupKey,
      "Price is missing id or product id",
    );
  }

  return {
    internalKey: expectation.internalKey,
    kind: expectation.kind,
    lookupKey,
    stripePriceId: price.id,
    stripeProductId: price.productId,
    currency: normalizeCurrency(price.currency),
    unitAmountCents: price.unitAmount,
    active: true,
    priceType: price.type,
    recurringInterval: price.recurringInterval,
    smsCredits: expectation.smsCredits,
  };
}

export async function resolveStripePriceByLookupKey(
  lookupKey: string,
  options: {
    listPrices: ListPricesByLookupKey;
    expectation?: CommercialPriceExpectation;
  },
): Promise<ResolvedStripePrice> {
  const expectation =
    options.expectation ??
    listCommercialPriceExpectations().find(
      (entry) => entry.lookupKey === lookupKey,
    );

  if (!expectation) {
    throw new BillingConfigurationError(
      `Lookup key "${lookupKey.slice(0, 64)}" is not in the approved commercial catalog.`,
    );
  }

  if (expectation.lookupKey !== lookupKey) {
    throw new BillingConfigurationError(
      "Expectation lookup key does not match requested lookup key.",
    );
  }

  const prices = await options.listPrices(lookupKey);
  return matchStripePriceToExpectation(prices, expectation);
}

/**
 * Resolve an approved internal plan/item key to a verified Stripe Price.
 * Server translates: internal key → catalog → lookup key → Stripe Price.
 */
export async function resolveStripePriceByInternalKey(
  internalKey: string,
  options: { listPrices: ListPricesByLookupKey },
): Promise<ResolvedStripePrice> {
  const expectation = commercialExpectationByInternalKey(internalKey);
  if (!expectation) {
    throw new BillingConfigurationError(
      `Internal commercial key "${internalKey.slice(0, 64)}" is not approved.`,
    );
  }
  return resolveStripePriceByLookupKey(expectation.lookupKey, {
    listPrices: options.listPrices,
    expectation,
  });
}

/**
 * Refuse live/unknown modes before any catalog network call.
 * Phase 4B-2 live validation is sandbox (test) only.
 */
export function assertSandboxCatalogValidationMode(
  secretKey: string | null | undefined,
  context = "Phase 4B-2 catalog validation",
): "test" {
  const mode = classifyStripeSecretMode(secretKey);
  if (mode === "live") {
    throw new StripeLiveModeForbiddenError(context);
  }
  if (mode !== "test") {
    throw new StripeUnknownModeForbiddenError(context);
  }
  return "test";
}

export async function validateStripeCommercialCatalog(options: {
  listPrices: ListPricesByLookupKey;
  /** Classified mode — must already be "test" for live network validation. */
  mode: StripeSecretMode;
}): Promise<StripeCommercialCatalogValidationReport> {
  if (options.mode === "live") {
    throw new StripeLiveModeForbiddenError();
  }
  if (options.mode !== "test") {
    throw new StripeUnknownModeForbiddenError();
  }

  const expectations = listCommercialPriceExpectations();
  const entries: CatalogEntryValidationResult[] = [];
  const errors: string[] = [];

  for (const expectation of expectations) {
    try {
      const resolved = await resolveStripePriceByLookupKey(
        expectation.lookupKey,
        {
          listPrices: options.listPrices,
          expectation,
        },
      );
      entries.push({
        internalKey: expectation.internalKey,
        kind: expectation.kind,
        lookupKey: expectation.lookupKey,
        ok: true,
        errorCode: null,
        errorMessage: null,
        resolved,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown catalog error";
      const code =
        error && typeof error === "object" && "code" in error
          ? String((error as { code: unknown }).code)
          : "stripe_catalog_error";
      entries.push({
        internalKey: expectation.internalKey,
        kind: expectation.kind,
        lookupKey: expectation.lookupKey,
        ok: false,
        errorCode: code,
        errorMessage: message,
        resolved: null,
      });
      errors.push(`${expectation.lookupKey}: ${message}`);
    }
  }

  return {
    valid: errors.length === 0,
    mode: options.mode,
    entriesChecked: expectations.length,
    entries,
    errors,
  };
}
