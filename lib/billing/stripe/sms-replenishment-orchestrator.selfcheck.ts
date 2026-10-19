/**
 * Automatic SMS replenishment orchestrator.
 * No Stripe, database, SMS, or email calls.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { StripePriceSnapshot } from "@/lib/billing/stripe/catalog";
import {
  runAutomaticSmsReplenishmentOrchestration,
  type OpenSmsReplenishmentAttempt,
  type SmsReplenishmentOrchestratorDeps,
  type SmsReplenishmentTaxCalculationView,
} from "@/lib/billing/stripe/sms-replenishment-orchestrator";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const organizationId = "22222222-2222-4222-8222-222222222222";
const attemptId = "11111111-1111-4111-8111-111111111111";
const nowSeconds = 1_800_000_000;

const address = {
  businessName: "Sanctuary SMS Tax Test",
  line1: "1 Main St",
  line2: null,
  city: "Seattle",
  state: "WA",
  postalCode: "98101",
  country: "US",
};

const price: StripePriceSnapshot = {
  id: "price_sms_50",
  productId: "prod_sms_50",
  active: true,
  currency: "usd",
  unitAmount: 500,
  type: "one_time",
  recurringInterval: null,
  lookupKey: "servant_standard_sms_50",
};

function claimed(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    outcome: "claimed",
    attempt_id: attemptId,
    plan_key: "servant_standard",
    package_key: "sms_block_50",
    expected_amount_cents: 500,
    ...overrides,
  };
}

function calculation(
  taxCents: number,
  overrides: Partial<SmsReplenishmentTaxCalculationView> = {},
): SmsReplenishmentTaxCalculationView {
  return {
    id: "taxcalc_orchestrator",
    currency: "usd",
    amountTotal: 500 + taxCents,
    taxAmountExclusive: taxCents,
    taxAmountInclusive: 0,
    expiresAt: nowSeconds + 3600,
    lineAmountCents: 500,
    customerId: "cus_sms",
    ...overrides,
  };
}

function harness(input: {
  claim?: Record<string, unknown>;
  address?: unknown;
  tax?: SmsReplenishmentTaxCalculationView | Error;
  snapshot?: Record<string, unknown>;
  execution?: { outcome: string; providerPaymentId: string | null };
  open?: OpenSmsReplenishmentAttempt | null;
  authorized?: boolean;
}) {
  const calls = {
    tax: 0,
    snapshot: 0,
    execute: 0,
    attention: [] as string[],
    grant: 0,
  };
  const deps: SmsReplenishmentOrchestratorDeps = {
    claim: async () => input.claim ?? { ok: false, outcome: "above_threshold" },
    loadBillingAddress: async () => (input.address === undefined ? address : input.address),
    loadCustomerId: async () => "cus_sms",
    listPackagePrices: async () => [price],
    createTaxCalculation: async ({ params }) => {
      calls.tax += 1;
      assert(params.currency === "usd", "tax currency");
      assert(params.customer === "cus_sms", "tax customer");
      assert(params.line_items[0]?.amount === 500, "tax subtotal");
      assert(params.line_items[0]?.product === "prod_sms_50", "tax product");
      assert(params.customer_details.address.line1 === "1 Main St", "tax address");
      if (input.tax instanceof Error) throw input.tax;
      return input.tax ?? calculation(53);
    },
    recordTaxSnapshot: async (snapshot) => {
      calls.snapshot += 1;
      assert(snapshot.attemptId === attemptId, "snapshot attempt");
      assert(snapshot.totalCents === snapshot.taxCents + 500, "snapshot total");
      return input.snapshot ?? { ok: true, outcome: "recorded" };
    },
    markTaxAttention: async (_organizationId, code) => {
      calls.attention.push(code);
      return { ok: true, outcome: "tax_attention_required" };
    },
    loadOpenAttempt: async () => input.open ?? null,
    executeAttempt: async () => {
      calls.execute += 1;
      return {
        outcome: input.execution?.outcome ?? "payment_pending",
        grantsCredits: false,
        providerPaymentId: input.execution?.providerPaymentId ?? "pi_orchestrator",
      };
    },
    taxCollectionAuthorized: input.authorized !== false,
    nowSeconds,
  };
  return { calls, deps };
}

async function notEligible() {
  const { calls, deps } = harness({ claim: { ok: false, outcome: "above_threshold" } });
  const result = await runAutomaticSmsReplenishmentOrchestration(organizationId, deps);
  assert(result.outcome === "above_threshold" && result.grantsCredits === false, "not eligible");
  assert(calls.tax === 0 && calls.execute === 0 && calls.snapshot === 0, "not eligible makes no stripe call");
}

async function taxedAttempt() {
  const { calls, deps } = harness({ claim: claimed() });
  const result = await runAutomaticSmsReplenishmentOrchestration(organizationId, deps);
  assert(result.outcome === "payment_pending", "taxed attempt charges");
  assert(result.grantsCredits === false, "taxed attempt does not grant");
  assert(result.attemptId === attemptId, "taxed attempt id");
  assert(calls.tax === 1 && calls.snapshot === 1 && calls.execute === 1, "taxed attempt once");
}

async function zeroTax() {
  const { calls, deps } = harness({
    claim: claimed(),
    tax: calculation(0, { id: "taxcalc_zero" }),
  });
  let recordedTax: number | null = null;
  const original = deps.recordTaxSnapshot;
  deps.recordTaxSnapshot = async (snapshot) => {
    recordedTax = snapshot.taxCents;
    return original(snapshot);
  };
  const result = await runAutomaticSmsReplenishmentOrchestration(organizationId, deps);
  assert(recordedTax === 0, "zero tax is stored");
  assert(result.outcome === "payment_pending" && calls.execute === 1, "zero tax may charge");
}

async function missingAddress() {
  const { calls, deps } = harness({ claim: claimed(), address: null });
  const result = await runAutomaticSmsReplenishmentOrchestration(organizationId, deps);
  assert(result.outcome === "tax_attention_required", "missing address");
  assert(calls.attention.includes("address_required"), "address code");
  assert(calls.tax === 0 && calls.execute === 0, "missing address does not charge");
}

async function invalidTax() {
  const { calls, deps } = harness({
    claim: claimed(),
    tax: calculation(53, { amountTotal: 999 }),
  });
  const result = await runAutomaticSmsReplenishmentOrchestration(organizationId, deps);
  assert(result.outcome === "tax_attention_required", "invalid tax");
  assert(calls.attention.includes("total_mismatch"), "invalid tax code");
  assert(calls.snapshot === 0 && calls.execute === 0, "invalid tax does not charge");
}

async function capExceeded() {
  const { calls, deps } = harness({
    claim: claimed(),
    snapshot: { ok: false, outcome: "period_cap_reached" },
  });
  const result = await runAutomaticSmsReplenishmentOrchestration(organizationId, deps);
  assert(result.outcome === "period_cap_reached" && result.grantsCredits === false, "cap");
  assert(calls.snapshot === 1 && calls.execute === 0, "cap closes before payment");
  assert(calls.attention.length === 0, "cap leaves configuration enabled");
}

async function priceIncrease() {
  const { calls, deps } = harness({
    claim: { ok: false, outcome: "authorization_review_required" },
  });
  const result = await runAutomaticSmsReplenishmentOrchestration(organizationId, deps);
  assert(result.outcome === "authorization_review_required", "price review");
  assert(calls.tax === 0 && calls.execute === 0, "price review does not charge");
}

async function paymentResults() {
  const success = harness({
    claim: claimed(),
    execution: { outcome: "payment_pending", providerPaymentId: "pi_ok" },
  });
  const succeeded = await runAutomaticSmsReplenishmentOrchestration(organizationId, success.deps);
  assert(
    succeeded.outcome === "payment_pending" &&
      succeeded.grantsCredits === false &&
      succeeded.providerPaymentId === "pi_ok",
    "synchronous success waits for webhook",
  );

  const failure = harness({
    claim: claimed(),
    execution: { outcome: "failed", providerPaymentId: "pi_fail" },
  });
  const failed = await runAutomaticSmsReplenishmentOrchestration(organizationId, failure.deps);
  assert(failed.outcome === "failed" && failed.grantsCredits === false, "payment failure");

  const action = harness({
    claim: claimed(),
    execution: { outcome: "failed", providerPaymentId: "pi_action" },
  });
  const requiresAction = await runAutomaticSmsReplenishmentOrchestration(organizationId, action.deps);
  assert(requiresAction.outcome === "failed" && requiresAction.grantsCredits === false, "requires action");
}

async function repeatedInvocation() {
  let claimedOnce = false;
  const { calls, deps } = harness({
    open: {
      id: attemptId,
      organizationId,
      status: "payment_pending",
      expectedAmountCents: 500,
      planKey: "servant_standard",
      packageKey: "sms_block_50",
      taxCalculationId: "taxcalc_orchestrator",
      taxCalculationExpiresAt: new Date((nowSeconds + 3600) * 1000).toISOString(),
      providerPaymentId: "pi_ok",
    },
    execution: { outcome: "awaiting_settlement", providerPaymentId: "pi_ok" },
  });
  let executions = 0;
  deps.executeAttempt = async () => {
    calls.execute += 1;
    executions += 1;
    return {
      outcome: executions === 1 ? "payment_pending" : "awaiting_settlement",
      grantsCredits: false,
      providerPaymentId: "pi_ok",
    };
  };
  deps.claim = async () => {
    if (!claimedOnce) {
      claimedOnce = true;
      return claimed();
    }
    return { ok: false, outcome: "open_attempt_exists" };
  };
  const first = await runAutomaticSmsReplenishmentOrchestration(organizationId, deps);
  const second = await runAutomaticSmsReplenishmentOrchestration(organizationId, deps);
  assert(first.outcome === "payment_pending", "first invocation");
  assert(second.outcome === "awaiting_settlement" && second.attemptId === attemptId, "second invocation");
  assert(calls.tax === 1 && calls.execute === 2 && calls.grant === 0, "no duplicate tax or grant");
}

function sourceDoesNotCallOrchestrator() {
  const root = process.cwd();
  const allowed = new Set([
    join(root, "lib/billing/stripe/sms-replenishment-orchestrator.ts"),
    join(root, "lib/billing/stripe/sms-replenishment-orchestrator-live.ts"),
    join(root, "lib/billing/stripe/sms-replenishment-orchestrator.selfcheck.ts"),
    join(root, "lib/billing/stripe/sms-replenishment-controls.selfcheck.ts"),
    join(root, "app/api/internal/testing/sms-auto-replenishment/route.ts"),
    join(root, "lib/billing/stripe/sms-replenishment-test-invocation.selfcheck.ts"),
  ]);
  const hits: string[] = [];
  function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".next" || entry.name === ".git") continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(path);
        continue;
      }
      if (!/\.(ts|tsx|js|mjs|json)$/.test(entry.name) || allowed.has(path)) continue;
      const text = readFileSync(path, "utf8");
      if (
        text.includes("orchestrateAutomaticSmsReplenishment") ||
        text.includes("runAutomaticSmsReplenishmentOrchestration")
      ) {
        hits.push(path);
      }
    }
  }
  walk(join(root, "app"));
  walk(join(root, "lib"));
  assert(hits.length === 0, `orchestrator has an unexpected caller: ${hits.join(", ")}`);
  const temporaryRoute = readFileSync(
    join(root, "app/api/internal/testing/sms-auto-replenishment/route.ts"),
    "utf8",
  );
  assert(
    temporaryRoute.includes("TEMPORARY CONTROLLED BILLING TEST ROUTE"),
    "temporary route is the only added caller",
  );
  assert(
    temporaryRoute.includes("orchestrateAutomaticSmsReplenishment"),
    "temporary route calls the live entry",
  );

  const live = readFileSync(
    join(root, "lib/billing/stripe/sms-replenishment-orchestrator-live.ts"),
    "utf8",
  );
  const sequence = readFileSync(
    join(root, "lib/billing/stripe/sms-replenishment-orchestrator.ts"),
    "utf8",
  );
  const claimSql = readFileSync(
    join(root, "supabase/migrations/110_sms_auto_replenishment_foundation.sql"),
    "utf8",
  );
  const vercel = readFileSync(join(root, "vercel.json"), "utf8");
  assert(live.includes('import "server-only"'), "live entry is server-only");
  assert(live.includes("claim_application_sms_replenishment"), "live claims through the database");
  assert(live.includes("record_application_sms_replenishment_tax_snapshot"), "live stores the tax snapshot");
  assert(live.includes("executeAutomaticSmsReplenishmentAttempt"), "live uses the payment executor");
  assert(!live.includes("record_automatic_application_sms_replenishment"), "live does not grant");
  assert(!sequence.includes("record_automatic_application_sms_replenishment"), "sequence does not grant");
  assert(!sequence.includes("checkout.sessions"), "abandoned checkouts are not read");
  assert(!claimSql.includes("checkout.sessions"), "claim does not read checkouts");
  assert(!vercel.includes("replenish"), "no replenishment cron");
  assert(sequence.includes("grantsCredits: false"), "result cannot grant");
}

async function main() {
  await notEligible();
  await taxedAttempt();
  await zeroTax();
  await missingAddress();
  await invalidTax();
  await capExceeded();
  await priceIncrease();
  await paymentResults();
  await repeatedInvocation();
  sourceDoesNotCallOrchestrator();
  console.log("sms replenishment orchestrator selfcheck passed");
}

void main();
