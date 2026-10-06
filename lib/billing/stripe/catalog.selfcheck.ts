/**
 * Phase 4B-2 Stripe catalog / Price resolution self-check (no Stripe network).
 * Run: npx --yes tsx lib/billing/stripe/catalog.selfcheck.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  listCommercialPriceExpectations,
  smsLookupKeyForExtraItem,
  subscriptionLookupKeyForPlan,
} from "@/lib/billing/commercial-catalog";
import {
  StripeCatalogAmbiguousError,
  StripeCatalogMismatchError,
  StripeCatalogNotFoundError,
  StripeLiveModeForbiddenError,
  StripeUnknownModeForbiddenError,
} from "@/lib/billing/errors";
import { getBillingProvider, isBillingProviderReady } from "@/lib/billing/provider";
import {
  assertSandboxCatalogValidationMode,
  matchStripePriceToExpectation,
  resolveStripePriceByInternalKey,
  type StripePriceSnapshot,
  validateStripeCommercialCatalog,
} from "@/lib/billing/stripe/catalog";
import { PLAN_KEYS } from "@/lib/subscriptions/plan-keys";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function basePrice(
  overrides: Partial<StripePriceSnapshot> &
    Pick<StripePriceSnapshot, "id" | "lookupKey" | "unitAmount" | "type">,
): StripePriceSnapshot {
  return {
    productId: "prod_selfcheck",
    active: true,
    currency: "usd",
    recurringInterval: overrides.type === "recurring" ? "month" : null,
    ...overrides,
  };
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

async function main() {
  // 1. internal subscription key → lookup key
  assert(
    subscriptionLookupKeyForPlan(PLAN_KEYS.SERVANT_STANDARD) ===
      "servant_standard_monthly",
    "servant_standard → servant_standard_monthly",
  );
  assert(
    subscriptionLookupKeyForPlan(PLAN_KEYS.OMNI_ENTERPRISE) ===
      "omni_enterprise_monthly",
    "omni_enterprise → omni_enterprise_monthly",
  );

  // 2. internal SMS package key → lookup key
  assert(
    smsLookupKeyForExtraItem("sms_block_50") === "servant_standard_sms_50",
    "sms_block_50 → servant_standard_sms_50",
  );
  assert(
    smsLookupKeyForExtraItem("sms_block_500") === "omni_enterprise_sms_500",
    "sms_block_500 → omni_enterprise_sms_500",
  );

  const expectations = listCommercialPriceExpectations();
  assert(expectations.length === 8, "eight commercial price expectations");

  const servantSub = expectations.find(
    (e) => e.lookupKey === "servant_standard_monthly",
  )!;
  const servantSms = expectations.find(
    (e) => e.lookupKey === "servant_standard_sms_50",
  )!;

  // 3. zero results → failure
  try {
    matchStripePriceToExpectation([], servantSub);
    throw new Error("expected not found");
  } catch (error) {
    assert(error instanceof StripeCatalogNotFoundError, "zero → not found");
  }

  // 4. multiple results → failure
  try {
    matchStripePriceToExpectation(
      [
        basePrice({
          id: "price_a",
          lookupKey: servantSub.lookupKey,
          unitAmount: 2995,
          type: "recurring",
        }),
        basePrice({
          id: "price_b",
          lookupKey: servantSub.lookupKey,
          unitAmount: 2995,
          type: "recurring",
        }),
      ],
      servantSub,
    );
    throw new Error("expected ambiguous");
  } catch (error) {
    assert(error instanceof StripeCatalogAmbiguousError, "multiple → ambiguous");
  }

  // 5. inactive → failure
  try {
    matchStripePriceToExpectation(
      [
        basePrice({
          id: "price_inactive",
          lookupKey: servantSub.lookupKey,
          unitAmount: 2995,
          type: "recurring",
          active: false,
        }),
      ],
      servantSub,
    );
    throw new Error("expected inactive mismatch");
  } catch (error) {
    assert(error instanceof StripeCatalogMismatchError, "inactive → mismatch");
    assert(
      String((error as Error).message).includes("inactive"),
      "inactive message",
    );
  }

  // 6. wrong currency → failure
  try {
    matchStripePriceToExpectation(
      [
        basePrice({
          id: "price_eur",
          lookupKey: servantSub.lookupKey,
          unitAmount: 2995,
          type: "recurring",
          currency: "eur",
        }),
      ],
      servantSub,
    );
    throw new Error("expected currency mismatch");
  } catch (error) {
    assert(error instanceof StripeCatalogMismatchError, "currency → mismatch");
  }

  // 7. wrong amount → failure
  try {
    matchStripePriceToExpectation(
      [
        basePrice({
          id: "price_amount",
          lookupKey: servantSub.lookupKey,
          unitAmount: 1999,
          type: "recurring",
        }),
      ],
      servantSub,
    );
    throw new Error("expected amount mismatch");
  } catch (error) {
    assert(error instanceof StripeCatalogMismatchError, "amount → mismatch");
  }

  // 8. recurring wrong interval → failure
  try {
    matchStripePriceToExpectation(
      [
        basePrice({
          id: "price_year",
          lookupKey: servantSub.lookupKey,
          unitAmount: 2995,
          type: "recurring",
          recurringInterval: "year",
        }),
      ],
      servantSub,
    );
    throw new Error("expected interval mismatch");
  } catch (error) {
    assert(error instanceof StripeCatalogMismatchError, "interval → mismatch");
  }

  // 9. subscription as one-time → failure
  try {
    matchStripePriceToExpectation(
      [
        basePrice({
          id: "price_onetime_sub",
          lookupKey: servantSub.lookupKey,
          unitAmount: 2995,
          type: "one_time",
          recurringInterval: null,
        }),
      ],
      servantSub,
    );
    throw new Error("expected type mismatch");
  } catch (error) {
    assert(
      error instanceof StripeCatalogMismatchError,
      "sub as one-time → mismatch",
    );
  }

  // 10. SMS package as recurring → failure
  try {
    matchStripePriceToExpectation(
      [
        basePrice({
          id: "price_sms_recurring",
          lookupKey: servantSms.lookupKey,
          unitAmount: 500,
          type: "recurring",
          recurringInterval: "month",
        }),
      ],
      servantSms,
    );
    throw new Error("expected sms type mismatch");
  } catch (error) {
    assert(
      error instanceof StripeCatalogMismatchError,
      "sms as recurring → mismatch",
    );
  }

  // 11. correct monthly subscription → success
  const okSub = matchStripePriceToExpectation(
    [
      basePrice({
        id: "price_ok_sub",
        productId: "prod_ok_sub",
        lookupKey: servantSub.lookupKey,
        unitAmount: 2995,
        type: "recurring",
        recurringInterval: "month",
      }),
    ],
    servantSub,
  );
  assert(okSub.stripePriceId === "price_ok_sub", "sub price id");
  assert(okSub.unitAmountCents === 2995, "sub amount");
  assert(okSub.priceType === "recurring", "sub type");
  assert(okSub.recurringInterval === "month", "sub interval");

  // 12. correct one-time SMS → success
  const okSms = matchStripePriceToExpectation(
    [
      basePrice({
        id: "price_ok_sms",
        productId: "prod_ok_sms",
        lookupKey: servantSms.lookupKey,
        unitAmount: 500,
        type: "one_time",
        recurringInterval: null,
      }),
    ],
    servantSms,
  );
  assert(okSms.smsCredits === 50, "sms credits");
  assert(okSms.priceType === "one_time", "sms type");

  // resolve by internal key (mock list)
  const resolved = await resolveStripePriceByInternalKey(
    PLAN_KEYS.STEWARD_PRO,
    {
      listPrices: async (lookupKey) => [
        basePrice({
          id: "price_steward",
          productId: "prod_steward",
          lookupKey,
          unitAmount: 3995,
          type: "recurring",
          recurringInterval: "month",
        }),
      ],
    },
  );
  assert(resolved.lookupKey === "steward_pro_monthly", "steward lookup");
  assert(resolved.internalKey === PLAN_KEYS.STEWARD_PRO, "steward internal");

  // 13. sanitized return has no secret
  const probe = "sk_test_phase4b2_selfcheck_NOT_A_REAL_SECRET";
  assert(!JSON.stringify(resolved).includes(probe), "resolved has no probe");
  assert(!JSON.stringify(resolved).includes("sk_"), "resolved has no sk_");

  // 14. live-key mode rejected before network
  try {
    assertSandboxCatalogValidationMode(
      "sk_live_phase4b2_selfcheck_NOT_A_REAL_SECRET",
    );
    throw new Error("expected live forbidden");
  } catch (error) {
    assert(error instanceof StripeLiveModeForbiddenError, "live forbidden");
  }

  let liveValidateCaught = false;
  try {
    await validateStripeCommercialCatalog({
      mode: "live",
      listPrices: async () => {
        throw new Error("network must not be called for live mode");
      },
    });
  } catch (error) {
    liveValidateCaught = error instanceof StripeLiveModeForbiddenError;
  }
  assert(liveValidateCaught, "validate refuses live before listPrices");

  // 15. unknown-key mode rejected
  try {
    assertSandboxCatalogValidationMode("not_a_stripe_key");
    throw new Error("expected unknown forbidden");
  } catch (error) {
    assert(
      error instanceof StripeUnknownModeForbiddenError,
      "unknown forbidden",
    );
  }

  // Full catalog validation success with mocks (no network)
  const mockCatalog = await validateStripeCommercialCatalog({
    mode: "test",
    listPrices: async (lookupKey) => {
      const expectation = expectations.find((e) => e.lookupKey === lookupKey)!;
      return [
        basePrice({
          id: `price_${lookupKey}`,
          productId: `prod_${lookupKey}`,
          lookupKey,
          unitAmount: expectation.unitAmountCents,
          type:
            expectation.billingScheme === "recurring_month"
              ? "recurring"
              : "one_time",
          recurringInterval:
            expectation.billingScheme === "recurring_month" ? "month" : null,
        }),
      ];
    },
  });
  assert(mockCatalog.valid === true, "mock catalog valid");
  assert(mockCatalog.entriesChecked === 8, "mock checked 8");

  // 16–18. Portal/webhooks disabled; Checkout enabled when Stripe configured
  await withEnv(
    {
      BILLING_PROVIDER: "stripe",
      STRIPE_SECRET_KEY: "sk_test_phase4b2_selfcheck_NOT_A_REAL_SECRET",
    },
    async () => {
      const provider = getBillingProvider();
      assert(provider.id === "stripe", "stripe provider");
      assert(provider.capabilities().checkout === true, "checkout true");
      assert(
        provider.capabilities().customerPortal === false,
        "portal false",
      );
      assert(provider.capabilities().webhooks === false, "webhooks false");
      assert(isBillingProviderReady(), "provider ready");
      const webhook = await provider.verifyAndParseWebhook({
        rawBody: "{}",
        headers: new Headers(),
      });
      assert(webhook.ok === false, "webhook rejected");
      assert(webhook.status === 501, "webhook 501");
    },
  );

  // Source safety: catalog-stripe uses read-only prices.list only
  const liveSource = readFileSync(
    join(process.cwd(), "lib/billing/stripe/catalog-stripe.ts"),
    "utf8",
  );
  assert(liveSource.includes("prices.list"), "uses prices.list");
  assert(!liveSource.includes("prices.create"), "no prices.create");
  assert(!liveSource.includes("products.create"), "no products.create");
  assert(!liveSource.includes("checkout.sessions"), "no checkout sessions");

  const clientSource = readFileSync(
    join(process.cwd(), "lib/billing/stripe/client.ts"),
    "utf8",
  );
  assert(clientSource.includes('import "server-only"'), "client server-only");

  console.log("stripe catalog self-check passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
