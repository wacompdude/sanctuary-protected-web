/**
 * Paid SMS Checkout webhook self-check.
 * No Stripe, Bird, Supabase, or email network calls.
 * Run: npx --yes tsx lib/billing/stripe/sms-purchase-webhook.selfcheck.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { billingHistoryEventTitle, smsCreditPurchaseHistoryDetail } from "@/lib/billing/history";
import {
  recordPaidSmsPackageInMemory,
  type SmsPaidPackageBooks,
  type SmsPaidPackageResult,
} from "@/lib/billing/sms-paid-purchase";
import type { StripePriceSnapshot } from "@/lib/billing/stripe/catalog";
import {
  handlePaidSmsPackageCheckout,
  smsPurchaseIdempotencyKey,
  type RecordPaidSmsPackage,
  type SmsCheckoutLineItem,
  type SmsPurchaseOrganizationStore,
} from "@/lib/billing/stripe/sms-purchase-webhook";
import { handleCheckoutSessionCompleted } from "@/lib/billing/stripe/webhook-sync";
import {
  summarizeStripeEventObject,
  type StripeWebhookObjectSummary,
} from "@/lib/billing/stripe/webhook-verify";
import type Stripe from "stripe";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function readRepo(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function stewardPrice(
  overrides: Partial<StripePriceSnapshot> = {},
): StripePriceSnapshot {
  return {
    id: "price_steward_sms",
    productId: "prod_sms",
    active: true,
    currency: "usd",
    unitAmount: 1000,
    type: "one_time",
    recurringInterval: null,
    lookupKey: "steward_pro_sms_100",
    ...overrides,
  };
}

function paidObject(
  overrides: Partial<StripeWebhookObjectSummary> = {},
): StripeWebhookObjectSummary {
  return {
    objectType: "checkout.session",
    id: "cs_a",
    customerId: "cus_1",
    subscriptionId: null,
    invoiceId: null,
    checkoutSessionId: "cs_a",
    priceItems: [],
    priceId: null,
    priceLookupKey: null,
    status: "complete",
    mode: "payment",
    paymentStatus: "paid",
    amountPaid: null,
    amountDue: null,
    currency: "usd",
    hostedInvoiceUrl: null,
    periodStart: null,
    periodEnd: null,
    cancelAtPeriodEnd: null,
    metadataOrganizationId: "org_1",
    metadataPlanKey: "steward_pro",
    metadataSanctuaryCheckout: "sms_package",
    metadataPackageKey: "sms_block_100",
    metadataLookupKey: "steward_pro_sms_100",
    metadataSmsSegments: "100",
    amountSubtotal: 1000,
    amountTotal: 1000,
    amountTax: 0,
    amountDiscount: 0,
    paymentIntentId: "pi_1",
    ...overrides,
  };
}

function paidLine(
  overrides: Partial<SmsCheckoutLineItem> = {},
): SmsCheckoutLineItem {
  return {
    quantity: 1,
    priceId: "price_steward_sms",
    price: stewardPrice(),
    amountSubtotal: 1000,
    amountTax: 0,
    amountTotal: 1000,
    amountDiscount: 0,
    currency: "usd",
    ...overrides,
  };
}

function emptyBooks(): SmsPaidPackageBooks {
  return {
    balance: null,
    reserved: 0,
    autoReplenishEnabled: null,
    transactions: [],
    ledger: [],
    nextId: 1,
  };
}

type Harness = {
  books: SmsPaidPackageBooks;
  calls: Parameters<RecordPaidSmsPackage>[0][];
  listCalls: string[];
  exists: boolean;
  mappedCustomer: string | null;
  lines: SmsCheckoutLineItem[];
  hasMore: boolean;
  record: RecordPaidSmsPackage | null;
  getPrice: StripePriceSnapshot | null | "throw";
  /** Webhook authority mode. Default "live"; override to prove Test never grants. */
  providerMode?: string | null;
};

function harness(overrides: Partial<Harness> = {}): Harness {
  return {
    books: emptyBooks(),
    calls: [],
    listCalls: [],
    exists: true,
    mappedCustomer: "cus_1",
    lines: [paidLine()],
    hasMore: false,
    record: null,
    getPrice: null,
    ...overrides,
  };
}

function storeFor(state: Harness): SmsPurchaseOrganizationStore {
  return {
    async organizationExists(organizationId) {
      return state.exists && organizationId === "org_1";
    },
    async getMappedStripeCustomerId(organizationId) {
      if (organizationId !== "org_1") return null;
      return state.mappedCustomer;
    },
    async findOrganizationByStripeCustomerId(customerId) {
      if (customerId !== "cus_1" || state.mappedCustomer !== "cus_1") return null;
      return { organizationId: "org_1", providerCustomerId: "cus_1" };
    },
  };
}

async function run(state: Harness, object = paidObject()) {
  const record =
    state.record ??
    (async (input) => {
      state.calls.push(input);
      return recordPaidSmsPackageInMemory(state.books, input);
    });
  return handlePaidSmsPackageCheckout(storeFor(state), object, {
    listCheckoutLineItems: async (sessionId) => {
      state.listCalls.push(sessionId);
      return { items: state.lines, hasMore: state.hasMore };
    },
    recordPaidSmsPackage: record,
    providerMode: state.providerMode === undefined ? 'live' : state.providerMode,
    getPriceById: async () => {
      if (state.getPrice === "throw") throw new Error("price retrieve failed");
      return state.getPrice;
    },
  });
}

async function expectIgnored(
  label: string,
  state: Harness,
  object?: StripeWebhookObjectSummary,
) {
  const result = await run(state, object);
  assert(result.outcome === "ignored", label);
  assert(result.metadata.sms_paid_validation_failed !== true, `${label} not paid failure`);
  assert(state.calls.length === 0, `${label} no credit`);
  assert(result.metadata.sms_package_purchase === false, `${label} not recorded`);
}

async function expectRejected(
  label: string,
  state: Harness,
  object?: StripeWebhookObjectSummary,
) {
  const result = await run(state, object);
  assert(result.outcome === "rejected", label);
  assert(result.metadata.sms_paid_validation_failed === true, `${label} durable paid failure`);
  assert(typeof result.metadata.sms_validation_code === "string", `${label} reason code`);
  assert(state.calls.length === 0, `${label} no credit`);
  assert(!JSON.stringify(result.metadata).includes("cus_"), `${label} no customer id`);
  assert(!JSON.stringify(result).toLowerCase().includes("email"), `${label} no email`);
}

async function main() {
  const subscriptionStore = {
    async findOrganizationByStripeCustomerId() {
      return { organizationId: "org_1", providerCustomerId: "cus_1" };
    },
  };
  const subscription = await handleCheckoutSessionCompleted(
    subscriptionStore as never,
    paidObject({
      metadataSanctuaryCheckout: null,
      mode: "subscription",
      paymentStatus: "paid",
    }),
  );
  assert(
    subscription.outcome === "processed" &&
      subscription.metadata.authoritative_activation === false,
    "1 subscription checkout stays correlation-only",
  );

  const nonSms = await handleCheckoutSessionCompleted(
    subscriptionStore as never,
    paidObject({
      metadataSanctuaryCheckout: null,
      mode: "payment",
      paymentStatus: "paid",
    }),
  );
  assert(
    nonSms.metadata.authoritative_activation === false &&
      nonSms.metadata.sms_package_purchase !== true,
    "2 non-SMS checkout does not grant",
  );

  await expectIgnored(
    "3 mode",
    harness(),
    paidObject({ mode: "subscription" }),
  );
  await expectIgnored(
    "4 unpaid",
    harness(),
    paidObject({ paymentStatus: "unpaid" }),
  );
  await expectIgnored(
    "4 no payment required",
    harness(),
    paidObject({ paymentStatus: "no_payment_required" }),
  );
  await expectRejected(
    "5 missing organization",
    harness(),
    paidObject({ metadataOrganizationId: null }),
  );
  await expectRejected("6 nonexistent organization", harness({ exists: false }));
  await expectRejected("6a test mode never grants SMS", harness({ providerMode: "test" }));
  await expectRejected("6b unclassified mode never grants SMS", harness({ providerMode: null }));
  {
    const live = harness();
    const liveResult = await run(live);
    assert(liveResult.outcome === "processed", "6c live evidence grants SMS");
    assert(live.calls[0]?.providerMode === "live", "6d recorder receives provider_mode live");
  }
  await expectRejected(
    "7 missing customer",
    harness(),
    paidObject({ customerId: null }),
  );
  await expectRejected(
    "8 customer mismatch",
    harness({ mappedCustomer: "cus_other" }),
  );

  const zero = harness({ lines: [] });
  await expectRejected("9 zero line items", zero);
  assert(zero.listCalls.length === 1, "9 listed line items");

  await expectRejected(
    "10 multiple line items",
    harness({ lines: [paidLine(), paidLine()] }),
  );
  await expectRejected("10 has more", harness({ hasMore: true }));
  await expectRejected(
    "11 quantity null",
    harness({ lines: [paidLine({ quantity: null })] }),
  );
  await expectRejected(
    "12 quantity 2",
    harness({ lines: [paidLine({ quantity: 2 })] }),
  );
  await expectRejected(
    "13 missing price",
    harness({ lines: [paidLine({ price: null, priceId: null })] }),
  );
  await expectRejected(
    "14 inactive price",
    harness({
      lines: [paidLine({ price: stewardPrice({ active: false }) })],
    }),
  );
  await expectRejected(
    "15 recurring price",
    harness({
      lines: [
        paidLine({
          price: stewardPrice({ type: "recurring", recurringInterval: "month" }),
        }),
      ],
    }),
  );
  await expectRejected(
    "16 non-USD price",
    harness({
      lines: [paidLine({ price: stewardPrice({ currency: "eur" }) })],
    }),
  );
  await expectRejected(
    "17 unknown lookup",
    harness({
      lines: [paidLine({ price: stewardPrice({ lookupKey: "custom_sms" }) })],
    }),
  );
  await expectRejected(
    "18 wrong unit amount",
    harness({
      lines: [paidLine({ price: stewardPrice({ unitAmount: 500 }) })],
    }),
  );
  await expectRejected(
    "19 total mismatch",
    harness(),
    paidObject({ amountTotal: 900 }),
  );
  await expectRejected(
    "20 tax mismatch",
    harness({ lines: [paidLine({ amountTax: 80 })] }),
    paidObject({ amountTax: 80 }),
  );
  await expectRejected(
    "21 lookup metadata",
    harness(),
    paidObject({ metadataLookupKey: "servant_standard_sms_50" }),
  );
  await expectRejected(
    "22 segment metadata",
    harness(),
    paidObject({ metadataSmsSegments: "50" }),
  );
  await expectRejected(
    "23 package metadata",
    harness(),
    paidObject({ metadataPackageKey: "sms_block_50" }),
  );
  await expectRejected(
    "24 malformed segments",
    harness(),
    paidObject({ metadataSmsSegments: "100abc" }),
  );
  await expectRejected(
    "24 leading zero",
    harness(),
    paidObject({ metadataSmsSegments: "0100" }),
  );

  const sold = harness();
  const recorded = await run(sold);
  assert(recorded.outcome === "processed", "25 recorded");
  assert(sold.calls[0]?.segments === 100, "25 trusted segments");
  assert(sold.calls[0]?.amountCents === 1000, "34 amount");
  assert(sold.calls[0]?.taxCents === 0, "35 tax");
  assert(sold.calls[0]?.providerPaymentId === "pi_1", "36 payment intent");
  assert(
    sold.calls[0]?.idempotencyKey === smsPurchaseIdempotencyKey("cs_a"),
    "32 purchase key",
  );
  assert(sold.books.balance === 100, "38 balance");
  const metadata = sold.calls[0]?.metadata ?? {};
  assert(
    metadata.stripe_checkout_session_id === "cs_a" &&
      metadata.package_key === "sms_block_100" &&
      metadata.lookup_key === "steward_pro_sms_100" &&
      metadata.plan_key_at_checkout === "steward_pro",
    "37 metadata fields",
  );
  const forbidden = [
    "email",
    "phone",
    "card",
    "cvc",
    "pan",
    "bank",
    "secret",
    "provider_payment_id",
    "idempotency_key",
  ];
  for (const key of forbidden) {
    assert(!(key in metadata), `37 no ${key}`);
  }

  const again = await run(sold);
  assert(
    again.outcome === "processed" &&
      again.metadata.sms_purchase_outcome === "duplicate" &&
      sold.books.balance === 100 &&
      sold.books.transactions.length === 1,
    "39 duplicate does not grant again",
  );

  const currentPlanIsNotConsulted = readRepo(
    "lib/billing/stripe/sms-purchase-webhook.ts",
  );
  assert(
    !currentPlanIsNotConsulted.includes("getCurrentSubscription"),
    "26 current plan is not consulted",
  );
  const planChanged = await run(harness());
  assert(planChanged.metadata.credited_segments === 100, "26 sold package stands");

  const expanded = summarizeStripeEventObject({
    id: "evt_1",
    object: "event",
    type: "checkout.session.completed",
    data: {
      object: {
        object: "checkout.session",
        id: "cs_expanded",
        customer: { id: "cus_1", email: "person@example.com" },
        payment_intent: { id: "pi_expanded" },
        metadata: { sanctuary_checkout: "sms_package" },
      },
    },
  } as unknown as Stripe.Event);
  assert(expanded.customerId === "cus_1", "27 expanded customer");
  assert(
    !JSON.stringify(expanded).includes("person@example.com"),
    "27 email not retained",
  );
  assert(expanded.paymentIntentId === "pi_expanded", "30 expanded payment intent");
  const taxedSummary = summarizeStripeEventObject({
    id: "evt_tax",
    object: "event",
    type: "checkout.session.completed",
    data: {
      object: {
        object: "checkout.session",
        id: "cs_tax_summary",
        customer: "cus_1",
        automatic_tax: { enabled: true, status: "complete" },
      },
    },
  } as unknown as Stripe.Event);
  assert(
    taxedSummary.checkoutAutomaticTax?.enabled === true &&
      taxedSummary.checkoutAutomaticTax.status === "complete",
    "automatic tax status is retained",
  );

  const plain = summarizeStripeEventObject({
    id: "evt_2",
    object: "event",
    type: "checkout.session.completed",
    data: {
      object: {
        object: "checkout.session",
        id: "cs_plain",
        customer: "cus_plain",
        payment_intent: "pi_plain",
      },
    },
  } as unknown as Stripe.Event);
  assert(plain.customerId === "cus_plain", "27 string customer");
  assert(plain.paymentIntentId === "pi_plain", "29 string payment intent");

  const nullIntent = harness();
  const nullIntentResult = await run(
    nullIntent,
    paidObject({ paymentIntentId: null, checkoutSessionId: "cs_null_pi", id: "cs_null_pi" }),
  );
  assert(
    nullIntentResult.outcome === "processed" &&
      nullIntent.calls[0]?.providerPaymentId === null,
    "31 null payment intent",
  );

  const priceIdOnly = harness({
    lines: [paidLine({ price: null, priceId: "price_steward_sms" })],
    getPrice: stewardPrice(),
  });
  const resolved = await run(
    priceIdOnly,
    paidObject({ checkoutSessionId: "cs_price_id", id: "cs_price_id" }),
  );
  assert(resolved.outcome === "processed", "13 price id resolves");

  const mismatch = await run(
    harness({
      record: async () =>
        ({
          ok: false,
          outcome: "idempotency_mismatch",
          duplicate: true,
          transactionId: "txn",
          ledgerId: "led",
          balance: 100,
          reserved: 0,
          available: 100,
          creditedSegments: 100,
          amountCents: 1000,
          taxCents: 0,
          providerPaymentId: "pi_1",
          providerPaymentIdNotRecorded: false,
        }) satisfies SmsPaidPackageResult,
    }),
  );
  assert(
    mismatch.outcome === "rejected" &&
      mismatch.metadata.sms_validation_code === "sms_purchase_idempotency_mismatch",
    "40 mismatch fails closed",
  );

  const reconcile = await run(
    harness({
      record: async () =>
        ({
          ok: false,
          outcome: "reconciliation_required",
          duplicate: false,
          transactionId: "txn",
          ledgerId: null,
          balance: 0,
          reserved: 0,
          available: 0,
          creditedSegments: 0,
          amountCents: 1000,
          taxCents: 0,
          providerPaymentId: null,
          providerPaymentIdNotRecorded: false,
        }) satisfies SmsPaidPackageResult,
    }),
  );
  assert(
    reconcile.outcome === "rejected" &&
      reconcile.metadata.sms_validation_code ===
        "sms_purchase_reconciliation_required",
    "41 reconciliation fails closed",
  );

  const taxedCheckout = harness({
    lines: [paidLine({ amountTax: 80, amountTotal: 1080 })],
  });
  const taxedCheckoutResult = await run(
    taxedCheckout,
    paidObject({
      id: "cs_tax",
      checkoutSessionId: "cs_tax",
      amountTax: 80,
      amountTotal: 1080,
    }),
  );
  assert(taxedCheckoutResult.outcome === "processed", "checkout tax recorded");
  assert(taxedCheckout.calls[0]?.taxCents === 80, "checkout tax separate");
  assert(taxedCheckout.calls[0]?.amountCents === 1000, "checkout subtotal");
  assert(taxedCheckout.calls[0]?.segments === 100, "checkout quantity ignores tax");
  assert(taxedCheckout.calls[0]?.metadata.tax_determined !== true, "untaxed session is not labeled determined");

  const determinedTax = harness({
    lines: [paidLine({ amountTax: 53, amountTotal: 1053 })],
  });
  const determinedTaxResult = await run(
    determinedTax,
    paidObject({
      id: "cs_determined",
      checkoutSessionId: "cs_determined",
      amountTax: 53,
      amountTotal: 1053,
      checkoutAutomaticTax: { enabled: true, status: "complete" },
    }),
  );
  assert(determinedTaxResult.outcome === "processed", "determined tax recorded");
  assert(determinedTax.calls[0]?.metadata.tax_determined === true, "determined tax marker");
  assert(determinedTax.calls[0]?.amountCents === 1000, "determined subtotal stays the package price");
  assert(determinedTax.calls[0]?.taxCents === 53, "determined tax is separate");
  assert(
    smsCreditPurchaseHistoryDetail({
      amountCents: 1000,
      taxCents: 53,
      taxDetermined: true,
    }) === "Subtotal: $10.00\nTax: $0.53\nTotal: $10.53",
    "determined tax history",
  );

  const determinedZero = harness({
    lines: [paidLine()],
  });
  const determinedZeroResult = await run(
    determinedZero,
    paidObject({
      id: "cs_zero_tax",
      checkoutSessionId: "cs_zero_tax",
      checkoutAutomaticTax: { enabled: true, status: "complete" },
    }),
  );
  assert(determinedZeroResult.outcome === "processed", "determined zero tax recorded");
  assert(determinedZero.calls[0]?.taxCents === 0, "determined zero tax amount");
  assert(determinedZero.calls[0]?.metadata.tax_determined === true, "zero tax remains determined");
  assert(
    smsCreditPurchaseHistoryDetail({ amountCents: 500, taxCents: 0, taxDetermined: true }) ===
      "Subtotal: $5.00\nTax: $0.00\nTotal: $5.00",
    "determined zero tax history",
  );
  assert(
    smsCreditPurchaseHistoryDetail({ amountCents: 500, taxCents: 0, taxDetermined: false }) === null,
    "historical zero tax is not labeled calculated",
  );

  const undetermined = harness({
    lines: [paidLine()],
  });
  const undeterminedResult = await run(
    undetermined,
    paidObject({
      id: "cs_undetermined",
      checkoutSessionId: "cs_undetermined",
      checkoutAutomaticTax: { enabled: true, status: "requires_location_inputs" },
    }),
  );
  assert(
    undeterminedResult.outcome === "rejected" &&
      undeterminedResult.metadata.sms_validation_code === "sms_tax_undetermined" &&
      undetermined.calls.length === 0,
    "undetermined tax does not grant credits",
  );

  const sameSession = harness();
  await run(sameSession, paidObject({ id: "cs_same" }));
  const secondEvent = await run(sameSession, paidObject({ id: "cs_same" }));
  assert(
    secondEvent.metadata.sms_purchase_outcome === "duplicate" &&
      sameSession.books.transactions.length === 1,
    "42 same session is one purchase",
  );

  const two = harness();
  await run(two, paidObject({ checkoutSessionId: "cs_one", id: "cs_one" }));
  await run(two, paidObject({ checkoutSessionId: "cs_two", id: "cs_two" }));
  assert(
    two.books.transactions.length === 2 &&
      two.calls[0]?.idempotencyKey !== two.calls[1]?.idempotencyKey &&
      two.books.balance === 200,
    "43 two sessions are two purchases",
  );

  assert(
    billingHistoryEventTitle({
      eventType: "checkout.session.completed",
      metadata: { handler: { sms_package_purchase: true } },
    }) === "SMS Credit Purchase",
    "history label",
  );
  assert(
    billingHistoryEventTitle({
      eventType: "checkout.session.completed",
      metadata: {},
    }) === "checkout.session.completed",
    "history leaves other events unchanged",
  );

  const handler = currentPlanIsNotConsulted;
  assert(!handler.includes("insertTransaction"), "44 no separate transaction insert");
  assert(!handler.includes("billing_invoices"), "45 no invoice");
  assert(!handler.includes("credit_purchased_application_sms_segments"), "uses 108 wrapper path");
  assert(!handler.includes("auto_replenish"), "49 no auto-replenish");
  assert(!handler.includes("refund"), "48 no refund");
  assert(!handler.includes("messagebird") && !handler.includes("/mfa"), "no bird or mfa");

  const page = readRepo("app/(app)/settings/billing/page.tsx");
  const urls = readRepo("lib/billing/stripe/checkout-urls.ts");
  assert(!page.includes("recordPaidApplicationSmsPackage"), "46 success page does not grant");
  assert(!page.includes("record_paid_application_sms_package"), "46 page does not call rpc");
  assert(urls.includes("sms_purchase=cancelled"), "47 cancel remains informational");
  assert(!urls.includes("recordPaidApplicationSmsPackage"), "47 cancel does not grant");

  for (const path of [
    "supabase/migrations/106_application_sms_capacity.sql",
    "supabase/migrations/107_credit_purchased_application_sms.sql",
    "supabase/migrations/108_record_paid_application_sms_package.sql",
    "lib/sms/sms-capacity-rpc.ts",
  ]) {
    assert(
      !readRepo(path).includes("handlePaidSmsPackageCheckout"),
      `${path} unchanged by this handler`,
    );
  }

  const rejected = await run(harness({ lines: [] }));
  assert(
    rejected.outcome === "rejected" &&
      rejected.metadata.sms_validation_code === "sms_line_items_invalid" &&
      rejected.organizationId === "org_1",
    "paid invalid line items are rejected with the organization id",
  );
  const webhookSource = readRepo("lib/billing/webhooks.ts");
  assert(webhookSource.includes('? "rejected"'), "rejected status is finalized");
  assert(
    webhookSource.includes('status === "failed" || isStaleReceived'),
    "rejected is not in the retry condition",
  );

  console.log("sms-purchase-webhook.selfcheck: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
