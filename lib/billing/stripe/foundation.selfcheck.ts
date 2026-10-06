/**
 * Phase 4B-1 Stripe server foundation self-check (no Stripe network / no secrets).
 * Run: npx --yes tsx lib/billing/stripe/foundation.selfcheck.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BillingConfigurationError,
  BillingNotImplementedError,
  BillingProviderUnknownError,
} from "@/lib/billing/errors";
import {
  getBillingProvider,
  isBillingProviderReady,
} from "@/lib/billing/provider";
import {
  classifyStripeSecretMode,
  getStripeBillingConfigStatus,
  isStripeSecretConfigured,
  resolveBillingProviderIdFromEnv,
  requireStripeSecretKey,
} from "@/lib/billing/stripe/config";
import { StripeBillingProvider } from "@/lib/billing/stripe/provider";
import { UnconfiguredBillingProvider } from "@/lib/billing/unconfigured-provider";
import { COMMERCIAL_PLAN_CATALOG } from "@/lib/billing/commercial-catalog";
import { PLAN_KEYS } from "@/lib/subscriptions/plan-keys";

function assert(condition: unknown, message: string) {
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
    if (next === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = next;
    }
  }
  return Promise.resolve()
    .then(() => fn())
    .finally(() => {
      for (const key of Object.keys(overrides)) {
        const value = previous[key];
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    });
}

function assertNoSecretLeak(text: string, secrets: string[]) {
  for (const secret of secrets) {
    if (!secret) continue;
    assert(!text.includes(secret), "error text must not include secret material");
  }
}

async function main() {
  // 1. unconfigured billing provider resolves safely
  await withEnv(
    { BILLING_PROVIDER: "unconfigured", STRIPE_SECRET_KEY: undefined },
    () => {
      assert(resolveBillingProviderIdFromEnv() === "none", "unconfigured → none");
      const provider = getBillingProvider();
      assert(provider instanceof UnconfiguredBillingProvider, "unconfigured provider");
      assert(provider.id === "none", "unconfigured id");
      assert(!provider.isConfigured(), "unconfigured not configured");
      assert(!isBillingProviderReady(), "unconfigured not ready");
    },
  );

  await withEnv({ BILLING_PROVIDER: "none", STRIPE_SECRET_KEY: undefined }, () => {
    assert(getBillingProvider().id === "none", "none → unconfigured provider");
  });

  await withEnv({ BILLING_PROVIDER: undefined, STRIPE_SECRET_KEY: undefined }, () => {
    assert(getBillingProvider().id === "none", "missing BILLING_PROVIDER → none");
  });

  // 2. stripe provider selection works structurally
  await withEnv(
    {
      BILLING_PROVIDER: "stripe",
      // Non-real synthetic prefixes for mode classification only — not Stripe secrets.
      STRIPE_SECRET_KEY: "sk_test_phase4b1_selfcheck_not_a_real_secret",
    },
    () => {
      const provider = getBillingProvider();
      assert(provider instanceof StripeBillingProvider, "stripe provider class");
      assert(provider.id === "stripe", "stripe id");
      assert(provider.isConfigured(), "stripe configured with key");
      assert(isBillingProviderReady(), "stripe checkout-ready when configured");
      const caps = provider.capabilities();
      assert(caps.checkout === true, "checkout capability true");
      assert(!caps.customerPortal, "portal capability false");
      assert(!caps.webhooks, "webhooks capability false");
    },
  );

  // 3. stripe without STRIPE_SECRET_KEY → sanitized configuration error
  await withEnv(
    { BILLING_PROVIDER: "stripe", STRIPE_SECRET_KEY: "" },
    async () => {
      const provider = getBillingProvider();
      assert(provider.id === "stripe", "stripe selected without key");
      assert(!provider.isConfigured(), "empty key not configured");
      assert(!isBillingProviderReady(), "not ready without key");

      let caught: unknown;
      try {
        requireStripeSecretKey("");
      } catch (error) {
        caught = error;
      }
      assert(caught instanceof BillingConfigurationError, "missing key config error");
      assert(
        String((caught as Error).message).includes("STRIPE_SECRET_KEY"),
        "mentions STRIPE_SECRET_KEY",
      );

      let checkoutError: unknown;
      try {
        await provider.createCheckoutSession({
          organizationId: "org_selfcheck",
          planKey: PLAN_KEYS.SERVANT_STANDARD,
          successUrl: "https://example.test/ok",
          cancelUrl: "https://example.test/cancel",
        });
      } catch (error) {
        checkoutError = error;
      }
      assert(
        checkoutError instanceof BillingConfigurationError,
        "checkout without key → config error",
      );
    },
  );

  // 4. unknown BILLING_PROVIDER rejected
  let unknownError: unknown;
  try {
    resolveBillingProviderIdFromEnv("paypal");
  } catch (error) {
    unknownError = error;
  }
  assert(unknownError instanceof BillingProviderUnknownError, "unknown provider error");

  await withEnv({ BILLING_PROVIDER: "braintree" }, () => {
    let thrown: unknown;
    try {
      getBillingProvider();
    } catch (error) {
      thrown = error;
    }
    assert(thrown instanceof BillingProviderUnknownError, "factory rejects unknown");
  });

  // 5. no secret in returned error text (live mode rejected before network)
  const probeSecret = "sk_live_phase4b1_selfcheck_PROBE_SECRET_VALUE_XYZ";
  await withEnv(
    { BILLING_PROVIDER: "stripe", STRIPE_SECRET_KEY: probeSecret },
    async () => {
      const provider = new StripeBillingProvider();
      let liveErr: unknown;
      try {
        await provider.createCheckoutSession({
          organizationId: "org_selfcheck",
          planKey: PLAN_KEYS.STEWARD_PRO,
          successUrl: "https://example.test/settings/billing?checkout=success",
          cancelUrl: "https://example.test/settings/billing?checkout=cancelled",
        });
      } catch (error) {
        liveErr = error;
      }
      assert(liveErr instanceof Error, "live checkout rejected");
      assertNoSecretLeak(String((liveErr as Error).message), [probeSecret]);
      assertNoSecretLeak(String((liveErr as Error).stack ?? ""), [probeSecret]);

      const status = getStripeBillingConfigStatus({
        BILLING_PROVIDER: "stripe",
        STRIPE_SECRET_KEY: probeSecret,
        STRIPE_WEBHOOK_SECRET: "whsec_phase4b1_selfcheck_not_real",
      });
      assertNoSecretLeak(JSON.stringify(status), [
        probeSecret,
        "whsec_phase4b1_selfcheck_not_real",
      ]);
    },
  );

  // 6–7. test/live mode classification without exposing key
  assert(
    classifyStripeSecretMode("sk_test_phase4b1_selfcheck_not_a_real_secret") ===
      "test",
    "sk_test_ → test",
  );
  assert(
    classifyStripeSecretMode("sk_live_phase4b1_selfcheck_not_a_real_secret") ===
      "live",
    "sk_live_ → live",
  );
  assert(classifyStripeSecretMode("pk_test_x") === "unknown", "publishable not secret");

  const testStatus = getStripeBillingConfigStatus({
    BILLING_PROVIDER: "stripe",
    STRIPE_SECRET_KEY: "sk_test_phase4b1_selfcheck_not_a_real_secret",
  });
  assert(testStatus.configured === true, "test status configured");
  assert(testStatus.mode === "test", "test status mode");
  assert(!("secret" in testStatus), "status has no secret field");

  const liveStatus = getStripeBillingConfigStatus({
    BILLING_PROVIDER: "stripe",
    STRIPE_SECRET_KEY: "sk_live_phase4b1_selfcheck_not_a_real_secret",
  });
  assert(liveStatus.mode === "live", "live status mode");

  // 8. empty key is not considered configured
  assert(!isStripeSecretConfigured(""), "empty string not configured");
  assert(!isStripeSecretConfigured("   "), "whitespace not configured");
  assert(!isStripeSecretConfigured(null), "null not configured");
  assert(
    getStripeBillingConfigStatus({
      BILLING_PROVIDER: "stripe",
      STRIPE_SECRET_KEY: "",
    }).configured === false,
    "empty key → not configured",
  );

  // 9. commercial catalog available to provider layer
  await withEnv(
    {
      BILLING_PROVIDER: "stripe",
      STRIPE_SECRET_KEY: "sk_test_phase4b1_selfcheck_not_a_real_secret",
    },
    () => {
      const provider = getBillingProvider() as StripeBillingProvider;
      const catalog = provider.getCommercialCatalog();
      assert(catalog === COMMERCIAL_PLAN_CATALOG, "same catalog reference");
      assert(catalog.length === 4, "four plans");
      assert(
        catalog.some((p) => p.subscriptionLookupKey === "servant_standard_monthly"),
        "servant lookup preserved",
      );
      assert(
        catalog.some((p) => p.smsPackageLookupKey === "servant_standard_sms_50"),
        "sms lookup preserved",
      );
      assert(
        !JSON.stringify(catalog).includes("price_"),
        "catalog has no hard-coded price_ ids",
      );
      assert(
        !JSON.stringify(catalog).includes("prod_"),
        "catalog has no hard-coded prod_ ids",
      );
    },
  );

  // 10. Portal/webhooks still unimplemented; Checkout is Phase 4B-3 (tested via mocks elsewhere)
  await withEnv(
    {
      BILLING_PROVIDER: "stripe",
      STRIPE_SECRET_KEY: "sk_test_phase4b1_selfcheck_not_a_real_secret",
    },
    async () => {
      const provider = new StripeBillingProvider();
      assert(provider.capabilities().checkout === true, "checkout enabled");
      assert(provider.capabilities().customerPortal === false, "portal disabled");

      let portalErr: unknown;
      try {
        await provider.createCustomerPortalSession({
          organizationId: "org_selfcheck",
          returnUrl: "https://example.test/billing",
        });
      } catch (error) {
        portalErr = error;
      }
      assert(portalErr instanceof BillingNotImplementedError, "portal not implemented");

      const webhook = await provider.verifyAndParseWebhook({
        rawBody: "{}",
        headers: new Headers({ "stripe-signature": "t=1,v1=fake" }),
      });
      assert(webhook.ok === false, "webhook rejected");
      assert(webhook.status === 501, "webhook not implemented status");
    },
  );

  // Client module stays server-only; SDK factory is lazy in sdk.ts
  const clientSource = readFileSync(
    join(process.cwd(), "lib/billing/stripe/client.ts"),
    "utf8",
  );
  assert(clientSource.includes('import "server-only"'), "client uses server-only");
  assert(
    clientSource.includes('from "@/lib/billing/stripe/sdk"'),
    "client re-exports sdk factory",
  );

  const sdkSource = readFileSync(
    join(process.cwd(), "lib/billing/stripe/sdk.ts"),
    "utf8",
  );
  assert(sdkSource.includes("new Stripe"), "sdk constructs Stripe lazily");
  assert(
    !sdkSource.includes("new Stripe(process.env"),
    "sdk does not construct at import with env",
  );
  assert(!sdkSource.includes('import "server-only"'), "sdk free of server-only");

  console.log("stripe foundation self-check passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
