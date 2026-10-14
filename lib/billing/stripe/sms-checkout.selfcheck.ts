/**
 * SMS package Checkout self-check.
 * No Stripe, Bird, Supabase, or email network calls.
 * Run: npx --yes tsx lib/billing/stripe/sms-checkout.selfcheck.ts
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { canManageOrganizationBilling } from "@/lib/billing/access";
import { commercialExpectationByLookupKey } from "@/lib/billing/commercial-catalog";
import { BillingCheckoutPlanError } from "@/lib/billing/errors";
import { summarizeApplicationSmsCapacity } from "@/lib/billing/sms-capacity-summary";
import {
  assertSubscriptionCheckoutPlanKey,
} from "@/lib/billing/stripe/checkout";
import {
  buildSmsPackageCheckoutUrls,
  smsPurchaseReturnMessage,
} from "@/lib/billing/stripe/checkout-urls";
import type { StripePriceSnapshot } from "@/lib/billing/stripe/catalog";
import type { BillingCustomerMappingStore } from "@/lib/billing/stripe/customers";
import {
  assertNoSmsCheckoutClientOverrides,
  createSmsPackageCheckoutSession,
  resolveTrustedSmsPackage,
  SMS_PACKAGE_ALLOWED_PAYMENT_METHOD_TYPES,
  stripeSmsCheckoutIdempotencyKey,
} from "@/lib/billing/stripe/sms-checkout";
import { PLAN_KEYS } from "@/lib/subscriptions/plan-keys";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function readRepo(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function memoryStore(customerId: string | null): BillingCustomerMappingStore {
  return {
    async getMappedCustomerId() {
      return customerId;
    },
    async saveMappedCustomerId() {
      throw new Error("customer mapping should not be written");
    },
    async getBillingContact() {
      return { email: null, name: null, organizationName: null };
    },
  };
}

function priceFor(lookupKey: string): StripePriceSnapshot {
  const expectation = commercialExpectationByLookupKey(lookupKey);
  if (!expectation || expectation.kind !== "sms_package") {
    throw new Error(`unexpected lookup ${lookupKey}`);
  }
  return {
    id: "price_sms_mock",
    productId: "prod_sms_mock",
    active: true,
    currency: "usd",
    unitAmount: expectation.unitAmountCents,
    type: "one_time",
    recurringInterval: null,
    lookupKey,
  };
}

const ORG = "11111111-1111-4111-8111-111111111111";
const SECRET = "sk_test_sms_checkout_selfcheck_NOT_A_REAL_SECRET";

async function expectPackage(
  planKey: (typeof PLAN_KEYS)[keyof typeof PLAN_KEYS],
  credits: number,
  cents: number,
  lookupKey: string,
) {
  const entry = resolveTrustedSmsPackage({
    subscriptionStatus: "active",
    planKey,
  });
  assert(entry.smsPackageCredits === credits, `${planKey} credits`);
  assert(entry.smsPackagePriceCents === cents, `${planKey} price`);
  assert(entry.smsPackageLookupKey === lookupKey, `${planKey} lookup`);
  assert(entry.monthlySmsSegmentLimit === 0 || entry.monthlySmsSegmentLimit > 0, `${planKey} limit present`);

  let customerSeen = "";
  const session = await createSmsPackageCheckoutSession(
    {
      organizationId: ORG,
      subscriptionStatus: "active",
      planKey,
      origin: "https://app.example.test",
      successUrl: "https://app.example.test/settings/billing?sms_purchase=success",
      cancelUrl: "https://app.example.test/settings/billing?sms_purchase=cancelled",
      attemptToken: `attempt-${planKey}`,
      stripeSecretKey: SECRET,
    },
    {
      listPrices: async (key) => [priceFor(key)],
      store: memoryStore("cus_existing"),
      stripeCustomers: {
        async createCustomer() {
          throw new Error("existing customer must be reused");
        },
      },
      stripeCheckout: {
        async createSmsPackageCheckoutSession(input) {
          customerSeen = input.customerId;
          assert(input.quantity === 1, "quantity 1");
          assert(
            input.allowedPaymentMethodTypes.length === 1 &&
              input.allowedPaymentMethodTypes[0] === "card",
            "card only",
          );
          assert(input.priceId === "price_sms_mock", "server price id");
          assert(input.metadata.sanctuary_checkout === "sms_package", "metadata kind");
          assert(input.metadata.organization_id === ORG, "metadata org");
          assert(input.metadata.plan_key === planKey, "metadata plan");
          assert(input.metadata.package_key === entry.smsExtraItemKey, "metadata package");
          assert(input.metadata.lookup_key === lookupKey, "metadata lookup");
          assert(input.metadata.sms_segments === String(credits), "metadata segments");
          const encoded = JSON.stringify(input.metadata);
          assert(!encoded.toLowerCase().includes("card"), "no card metadata");
          assert(!encoded.includes("cvc") && !encoded.includes("pan"), "no payment secrets");
          assert(!encoded.includes("+1"), "no phone");
          return { id: "cs_test_mock", url: "https://checkout.stripe.test/c/cs_test_mock" };
        },
      },
    },
  );
  assert(customerSeen === "cus_existing", "reused customer");
  assert(session.sessionId === "cs_test_mock", "session id from stripe");
  assert(!session.metadata.lookup_key.includes("price_"), "metadata is not a price id");
}

async function main() {
  await expectPackage(PLAN_KEYS.SERVANT_STANDARD, 50, 500, "servant_standard_sms_50");
  await expectPackage(PLAN_KEYS.STEWARD_PRO, 100, 1000, "steward_pro_sms_100");
  await expectPackage(PLAN_KEYS.SHEPHERD_PLUS, 200, 2000, "shepherd_plus_sms_200");
  await expectPackage(PLAN_KEYS.OMNI_ENTERPRISE, 500, 4000, "omni_enterprise_sms_500");

  const servant = resolveTrustedSmsPackage({
    subscriptionStatus: "active",
    planKey: PLAN_KEYS.SERVANT_STANDARD,
  });
  assert(servant.monthlySmsSegmentLimit === 0, "5 servant included limit is 0");
  assert(servant.smsPackageCredits === 50, "5 servant can still purchase");

  for (const input of [
    { priceId: "price_browser" },
    { productId: "prod_browser" },
    { amount: 100 },
    { currency: "eur" },
    { lookupKey: "steward_pro_sms_100" },
    { planKey: PLAN_KEYS.OMNI_ENTERPRISE },
    { segments: 500 },
  ]) {
    let rejected = false;
    try {
      assertNoSmsCheckoutClientOverrides(input);
    } catch (error) {
      rejected = error instanceof BillingCheckoutPlanError;
    }
    assert(rejected, `browser override rejected ${JSON.stringify(input)}`);
  }

  let checkoutCalls = 0;
  try {
    await createSmsPackageCheckoutSession(
      {
        organizationId: ORG,
        subscriptionStatus: "cancelled",
        planKey: PLAN_KEYS.STEWARD_PRO,
        origin: "https://app.example.test",
        successUrl: "https://app.example.test/settings/billing?sms_purchase=success",
        cancelUrl: "https://app.example.test/settings/billing?sms_purchase=cancelled",
        attemptToken: "closed",
        stripeSecretKey: SECRET,
      },
      {
        listPrices: async () => {
          throw new Error("must not list prices");
        },
        store: memoryStore("cus_existing"),
        stripeCustomers: {
          async createCustomer() {
            throw new Error("must not create customer");
          },
        },
        stripeCheckout: {
          async createSmsPackageCheckoutSession() {
            checkoutCalls += 1;
            return { id: "cs_no", url: "https://checkout.stripe.test/no" };
          },
        },
      },
    );
    throw new Error("cancelled subscription must not check out");
  } catch (error) {
    assert(error instanceof BillingCheckoutPlanError, "fail closed");
  }
  assert(checkoutCalls === 0, "no session for ineligible plan");

  const urls = buildSmsPackageCheckoutUrls("https://app.example.test");
  assert(urls.successUrl.endsWith("/settings/billing?sms_purchase=success"), "17 success url");
  assert(urls.cancelUrl.endsWith("/settings/billing?sms_purchase=cancelled"), "18 cancel url");
  assert(!urls.successUrl.includes("checkout=success"), "success is not a subscription return");
  const successCopy = smsPurchaseReturnMessage("success") ?? "";
  const cancelCopy = smsPurchaseReturnMessage("cancelled") ?? "";
  assert(successCopy.includes("after payment confirmation"), "19 success is informational");
  assert(cancelCopy.includes("No credits were added"), "20 cancel adds nothing");
  assert(smsPurchaseReturnMessage("success") !== null, "success copy");

  const firstKey = stripeSmsCheckoutIdempotencyKey({
    organizationId: ORG,
    packageKey: "sms_block_100",
    attemptToken: "attempt-a",
  });
  const secondKey = stripeSmsCheckoutIdempotencyKey({
    organizationId: ORG,
    packageKey: "sms_block_100",
    attemptToken: "attempt-b",
  });
  assert(firstKey !== secondKey, "later purchases are not permanently blocked");
  assert(firstKey.startsWith("sp_sms_cs_"), "request-scoped checkout key");

  assert(
    SMS_PACKAGE_ALLOWED_PAYMENT_METHOD_TYPES.join(",") === "card",
    "26 delayed methods are not listed",
  );

  let subscriptionRejected = false;
  try {
    assertSubscriptionCheckoutPlanKey("steward_pro_sms_100");
  } catch (error) {
    subscriptionRejected = error instanceof BillingCheckoutPlanError;
  }
  assert(subscriptionRejected, "23 subscription checkout rejects SMS keys");

  assert(!canManageOrganizationBilling("administrator"), "24 administrator cannot purchase");
  assert(canManageOrganizationBilling("owner"), "25 owner can purchase");
  assert(canManageOrganizationBilling("co_owner"), "25 co-owner can purchase");

  const summary = summarizeApplicationSmsCapacity({
    includedLimit: 250,
    includedUsed: 1,
    includedReserved: 0,
    purchasedBalance: null,
    purchasedReserved: null,
  });
  assert(summary.remainingIncluded === 249, "remaining included");
  assert(summary.purchasedBalance === 0 && summary.purchasedReserved === 0, "missing row is zero");
  assert(summary.totalAvailable === 249, "total available");

  const held = summarizeApplicationSmsCapacity({
    includedLimit: 250,
    includedUsed: 1,
    includedReserved: 2,
    purchasedBalance: 100,
    purchasedReserved: 5,
  });
  assert(held.remainingIncluded === 247, "included hold");
  assert(held.purchasedAvailable === 95, "purchased available");
  assert(held.totalAvailable === 342, "total with purchased");

  const live = readRepo("lib/billing/stripe/sms-checkout-live.ts");
  assert(live.includes('mode: "payment"'), "12 live mode is payment");
  assert(!live.includes('mode: "subscription"'), "12 not subscription mode");
  assert(live.includes("allowed_payment_method_types"), "26 card filter is applied");
  assert(live.includes("allowedPaymentMethodTypes"), "26 payment methods come from the helper");
  assert(!live.includes("automatic_tax"), "checkout tax is gated outside live session text");
  assert(live.includes("smsCheckoutAutomaticTaxFields"), "checkout tax fields are shared");
  assert(live.includes("smsPurchaseTaxCollectionAuthorized"), "checkout tax requires authorization");
  assert(!live.includes("invoice_creation"), "no invoice creation");
  assert(!live.includes("us_bank_account"), "no bank debit");
  assert(!live.includes("customer_balance"), "no pay by bank balance");
  assert(!live.includes("cashapp"), "no cash app");
  assert(!live.includes("klarna"), "no klarna");
  assert(!live.includes("amazon_pay"), "no amazon pay");
  assert(!live.includes("credit_purchased_application_sms_segments"), "21 live checkout does not grant");

  const helper = readRepo("lib/billing/stripe/sms-checkout.ts");
  assert(helper.includes('quantity: 1'), "13 quantity fixed at 1");
  assert(!helper.includes("credit_purchased_application_sms_segments"), "21 helper does not grant");

  const action = readRepo("app/(app)/settings/billing/actions.ts");
  const smsAction = action.slice(action.indexOf("export async function startSmsPackageCheckoutAction"));
  const smsActionBody = smsAction.slice(0, smsAction.indexOf("export async function openCustomerPortalAction"));
  assert(smsActionBody.includes("requireBillingManageAccess()"), "server authorization");
  assert(smsActionBody.includes("getChurchSubscription"), "11 current subscription");
  assert(!smsActionBody.includes("formData.get(\"plan_key\")") || smsActionBody.includes("assertNoSmsCheckoutClientOverrides"), "plan key is not trusted");
  assert(!smsActionBody.includes("credit_purchased_application_sms_segments"), "21 action does not grant");
  assert(!smsActionBody.includes("billing_transactions"), "22 no billing transaction");
  assert(!smsActionBody.includes("organization_sms_credit_balances"), "no balance write");

  const page = readRepo("app/(app)/settings/billing/page.tsx");
  assert(page.includes("Application SMS"), "billing section");
  assert(page.includes("Purchased available"), "purchased available is displayed");
  assert(page.includes("smsPurchaseReturnMessage"), "return copy");
  assert(page.includes(".select(\"balance, reserved\")"), "read purchased balance");
  assert(!page.includes(".insert("), "page does not insert credits");
  assert(!page.includes("credit_purchased_application_sms_segments"), "page does not grant");
  assert(page.includes("canManageBilling"), "purchase control follows manage access");
  assert(page.includes("Servant Standard does not include monthly application SMS credits."), "servant copy");

  const webhook = readRepo("lib/billing/stripe/webhook-sync.ts");
  assert(!webhook.includes("credit_purchased_application_sms_segments"), "40 webhook does not grant");
  assert(webhook.includes("authoritative_activation: false"), "checkout completion stays non-authoritative");

  const subscriptionCheckout = readRepo("lib/billing/stripe/checkout.ts");
  assert(subscriptionCheckout.includes('raw.startsWith("sms_block_")'), "23 sms block rejected");
  assert(subscriptionCheckout.includes('raw.includes("_sms_")'), "23 sms lookup rejected");
  assert(!existsSync(join(process.cwd(), "supabase/migrations/108_sms_package_checkout.sql")), "no migration 108");

  const panel = readRepo("components/billing/sms-package-panel.tsx");
  assert(panel.includes("purchase_current_sms_package"), "intent only");
  assert(!panel.includes("price_id"), "button does not send a price id");

  console.log("sms package checkout self-check passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
