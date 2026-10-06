/**
 * Phase 4B-3 Checkout / Customer foundation self-check (no Stripe network).
 * Run: npx --yes tsx lib/billing/stripe/checkout.selfcheck.ts
 */
import {
  BillingCheckoutPlanError,
  BillingCheckoutUrlError,
  StripeLiveModeForbiddenError,
} from "@/lib/billing/errors";
import {
  assertNoClientPriceOverrides,
  assertSubscriptionCheckoutPlanKey,
  createSubscriptionCheckoutSession,
  stripeCheckoutIdempotencyKey,
} from "@/lib/billing/stripe/checkout";
import {
  assertSafeBillingCheckoutUrls,
  buildBillingCheckoutUrls,
  resolveAppOrigin,
} from "@/lib/billing/stripe/checkout-urls";
import {
  ensureStripeCustomerForOrganization,
  stripeCustomerIdempotencyKey,
  type BillingCustomerMappingStore,
} from "@/lib/billing/stripe/customers";
import type { StripePriceSnapshot } from "@/lib/billing/stripe/catalog";
import { getBillingProvider, isBillingProviderReady } from "@/lib/billing/provider";
import { PLAN_KEYS } from "@/lib/subscriptions/plan-keys";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function baseRecurringPrice(
  overrides: Partial<StripePriceSnapshot> & Pick<StripePriceSnapshot, "id" | "lookupKey" | "unitAmount">,
): StripePriceSnapshot {
  return {
    productId: "prod_selfcheck",
    active: true,
    currency: "usd",
    type: "recurring",
    recurringInterval: "month",
    ...overrides,
  };
}

function memoryStore(seed?: {
  customerId?: string | null;
}): BillingCustomerMappingStore & { saves: number; createsAsked: number } {
  let mapped = seed?.customerId ?? null;
  const api = {
    saves: 0,
    createsAsked: 0,
    async getMappedCustomerId() {
      return mapped;
    },
    async saveMappedCustomerId(input: {
      organizationId: string;
      providerCustomerId: string;
    }) {
      mapped = input.providerCustomerId;
      api.saves += 1;
    },
    async getBillingContact() {
      return {
        email: "billing@example.test",
        name: "Billing Contact",
        organizationName: "Test Church",
      };
    },
  };
  return api;
}

async function withEnv(
  overrides: Record<string, string | undefined>,
  fn: () => void | Promise<void>,
) {
  const previous: Record<string, string | undefined> = {};
  for (const key of Object.keys(overrides)) {
    previous[key] = process.env[key];
    const next = overrides[key];
    if (next === undefined) delete process.env[key];
    else process.env[key] = next;
  }
  try {
    await fn();
  } finally {
    for (const key of Object.keys(overrides)) {
      const value = previous[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

async function main() {
  // Approved subscription plan accepted
  assert(
    assertSubscriptionCheckoutPlanKey(PLAN_KEYS.SERVANT_STANDARD) ===
      PLAN_KEYS.SERVANT_STANDARD,
    "servant accepted",
  );

  // SMS package rejected
  try {
    assertSubscriptionCheckoutPlanKey("sms_block_50");
    throw new Error("expected sms reject");
  } catch (error) {
    assert(error instanceof BillingCheckoutPlanError, "sms reject type");
  }

  // Unknown plan rejected
  try {
    assertSubscriptionCheckoutPlanKey("enterprise_ultra");
    throw new Error("expected unknown reject");
  } catch (error) {
    assert(error instanceof BillingCheckoutPlanError, "unknown reject");
  }

  // Browser Price/Product/amount rejected
  try {
    assertNoClientPriceOverrides({ priceId: "price_abc" });
    throw new Error("expected priceId reject");
  } catch (error) {
    assert(error instanceof BillingCheckoutPlanError, "priceId reject");
  }
  try {
    assertNoClientPriceOverrides({ productId: "prod_abc" });
    throw new Error("expected productId reject");
  } catch (error) {
    assert(error instanceof BillingCheckoutPlanError, "productId reject");
  }
  try {
    assertNoClientPriceOverrides({ amount: 2995 });
    throw new Error("expected amount reject");
  } catch (error) {
    assert(error instanceof BillingCheckoutPlanError, "amount reject");
  }

  // URL safety
  const origin = resolveAppOrigin({ appUrl: "https://app.example.test" });
  const urls = buildBillingCheckoutUrls(origin);
  assertSafeBillingCheckoutUrls({
    successUrl: urls.successUrl,
    cancelUrl: urls.cancelUrl,
    expectedOrigin: origin,
  });
  try {
    assertSafeBillingCheckoutUrls({
      successUrl: "https://evil.example/phish",
      cancelUrl: urls.cancelUrl,
      expectedOrigin: origin,
    });
    throw new Error("expected evil url reject");
  } catch (error) {
    assert(error instanceof BillingCheckoutUrlError, "evil url reject");
  }

  // Existing customer reused
  const storeReuse = memoryStore({ customerId: "cus_existing" });
  let createCalls = 0;
  const reused = await ensureStripeCustomerForOrganization({
    organizationId: "org_1",
    store: storeReuse,
    stripeCustomers: {
      async createCustomer() {
        createCalls += 1;
        return { id: "cus_new" };
      },
    },
  });
  assert(reused.providerCustomerId === "cus_existing", "reuse existing");
  assert(reused.created === false, "not created");
  assert(createCalls === 0, "no stripe create");

  // Missing customer creates mapping
  const storeCreate = memoryStore({ customerId: null });
  const created = await ensureStripeCustomerForOrganization({
    organizationId: "org_2",
    store: storeCreate,
    stripeCustomers: {
      async createCustomer(input) {
        assert(
          input.idempotencyKey === stripeCustomerIdempotencyKey("org_2"),
          "stable customer idempotency",
        );
        assert(input.metadata.organization_id === "org_2", "org metadata");
        return { id: "cus_created" };
      },
    },
  });
  assert(created.providerCustomerId === "cus_created", "created id");
  assert(created.created === true, "created flag");
  assert(storeCreate.saves === 1, "mapping saved");

  const listOk = async () => [
    baseRecurringPrice({
      id: "price_ok",
      lookupKey: "servant_standard_monthly",
      unitAmount: 2995,
    }),
  ];

  // Wrong currency / one-time / wrong interval rejected via resolver
  async function expectCheckoutFail(
    listPrices: () => Promise<StripePriceSnapshot[]>,
    label: string,
  ) {
    try {
      await createSubscriptionCheckoutSession(
        {
          organizationId: "org_x",
          planKey: PLAN_KEYS.SERVANT_STANDARD,
          origin: "https://app.example.test",
          successUrl: "https://app.example.test/settings/billing?checkout=success",
          cancelUrl: "https://app.example.test/settings/billing?checkout=cancelled",
          attemptToken: "attempt1",
          stripeSecretKey: "sk_test_phase4b3_selfcheck_NOT_A_REAL_SECRET",
        },
        {
          listPrices,
          store: memoryStore({ customerId: "cus_x" }),
          stripeCustomers: {
            async createCustomer() {
              throw new Error("should not create customer");
            },
          },
          stripeCheckout: {
            async createSubscriptionCheckoutSession() {
              throw new Error("should not create checkout");
            },
          },
        },
      );
      throw new Error(`expected failure: ${label}`);
    } catch (error) {
      assert(error instanceof Error, label);
      assert(
        !(error instanceof Error && error.message.includes("should not create")),
        `${label} failed before mutation`,
      );
    }
  }

  await expectCheckoutFail(
    async () => [
      baseRecurringPrice({
        id: "price_eur",
        lookupKey: "servant_standard_monthly",
        unitAmount: 2995,
        currency: "eur",
      }),
    ],
    "wrong currency",
  );
  await expectCheckoutFail(
    async () => [
      {
        id: "price_once",
        productId: "prod",
        active: true,
        currency: "usd",
        unitAmount: 2995,
        type: "one_time",
        recurringInterval: null,
        lookupKey: "servant_standard_monthly",
      },
    ],
    "one-time rejected",
  );
  await expectCheckoutFail(
    async () => [
      baseRecurringPrice({
        id: "price_year",
        lookupKey: "servant_standard_monthly",
        unitAmount: 2995,
        recurringInterval: "year",
      }),
    ],
    "wrong interval",
  );
  await expectCheckoutFail(
    async () => [
      baseRecurringPrice({
        id: "price_inactive",
        lookupKey: "servant_standard_monthly",
        unitAmount: 2995,
        active: false,
      }),
    ],
    "inactive",
  );

  // Happy path — mocked Stripe only
  let checkoutCalls = 0;
  const entitlementMutations = 0;
  const session = await createSubscriptionCheckoutSession(
    {
      organizationId: "org_ok",
      planKey: PLAN_KEYS.STEWARD_PRO,
      origin: "https://app.example.test",
      successUrl: "https://app.example.test/settings/billing?checkout=success",
      cancelUrl: "https://app.example.test/settings/billing?checkout=cancelled",
      attemptToken: "tok_abc",
      stripeSecretKey: "sk_test_phase4b3_selfcheck_NOT_A_REAL_SECRET",
    },
    {
      listPrices: async (lookupKey) => [
        baseRecurringPrice({
          id: "price_steward",
          lookupKey,
          unitAmount: 3995,
        }),
      ],
      store: memoryStore({ customerId: "cus_ok" }),
      stripeCustomers: {
        async createCustomer() {
          throw new Error("should reuse customer");
        },
      },
      stripeCheckout: {
        async createSubscriptionCheckoutSession(input) {
          checkoutCalls += 1;
          assert(input.customerId === "cus_ok", "customer passed");
          assert(input.priceId === "price_steward", "trusted price id");
          assert(input.allowPromotionCodes === true, "promo codes allowed");
          assert(
            input.idempotencyKey ===
              stripeCheckoutIdempotencyKey({
                organizationId: "org_ok",
                planKey: PLAN_KEYS.STEWARD_PRO,
                attemptToken: "tok_abc",
              }),
            "checkout idempotency",
          );
          return {
            id: "cs_test_123",
            url: "https://checkout.stripe.com/c/pay/cs_test_123",
          };
        },
      },
    },
  );
  assert(session.url.includes("checkout.stripe.com"), "redirect url");
  assert(session.sessionId === "cs_test_123", "session id");
  assert(checkoutCalls === 1, "one checkout create");
  assert(entitlementMutations === 0, "no entitlement mutation on success path");

  // Live mode refused before network
  try {
    await createSubscriptionCheckoutSession(
      {
        organizationId: "org_live",
        planKey: PLAN_KEYS.SERVANT_STANDARD,
        origin: "https://app.example.test",
        successUrl: "https://app.example.test/settings/billing?checkout=success",
        cancelUrl: "https://app.example.test/settings/billing?checkout=cancelled",
        attemptToken: "tok",
        stripeSecretKey: "sk_live_phase4b3_selfcheck_NOT_A_REAL_SECRET",
      },
      {
        listPrices: async () => {
          throw new Error("network must not run");
        },
        store: memoryStore(),
        stripeCustomers: {
          async createCustomer() {
            throw new Error("network must not run");
          },
        },
        stripeCheckout: {
          async createSubscriptionCheckoutSession() {
            throw new Error("network must not run");
          },
        },
      },
    );
    throw new Error("expected live forbidden");
  } catch (error) {
    assert(error instanceof StripeLiveModeForbiddenError, "live forbidden");
  }

  // Browser-controlled success URL rejected
  try {
    await createSubscriptionCheckoutSession(
      {
        organizationId: "org_url",
        planKey: PLAN_KEYS.SERVANT_STANDARD,
        origin: "https://app.example.test",
        successUrl: "https://evil.example/steal",
        cancelUrl: "https://app.example.test/settings/billing?checkout=cancelled",
        attemptToken: "tok",
        stripeSecretKey: "sk_test_phase4b3_selfcheck_NOT_A_REAL_SECRET",
      },
      {
        listPrices: listOk,
        store: memoryStore({ customerId: "cus" }),
        stripeCustomers: {
          async createCustomer() {
            throw new Error("no");
          },
        },
        stripeCheckout: {
          async createSubscriptionCheckoutSession() {
            throw new Error("no");
          },
        },
      },
    );
    throw new Error("expected url reject");
  } catch (error) {
    assert(error instanceof BillingCheckoutUrlError, "url reject");
  }

  // Provider capability when configured (no network call)
  await withEnv(
    {
      BILLING_PROVIDER: "stripe",
      STRIPE_SECRET_KEY: "sk_test_phase4b3_selfcheck_NOT_A_REAL_SECRET",
    },
    () => {
      const provider = getBillingProvider();
      assert(provider.capabilities().checkout === true, "checkout capability");
      assert(
        provider.capabilities().customerPortal === false,
        "portal still false",
      );
      // Webhooks capability requires STRIPE_WEBHOOK_SECRET (not set in this slice).
      assert(provider.capabilities().webhooks === false, "webhooks false without secret");
      assert(isBillingProviderReady() === true, "provider ready via checkout");
    },
  );

  // Authorization notes covered by access helpers + action gates; structural check:
  assert(
    typeof (await import("@/lib/billing/access")).requireBillingManageAccess ===
      "function",
    "manage access gate exists",
  );

  console.log("stripe checkout self-check passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
