/**
 * Stage 2B Live/Test billing isolation self-check.
 * Pure unit/static checks with fakes: NO Stripe calls, NO DB writes, NO network.
 * Run: npx --yes tsx lib/billing/stripe/live-test-isolation.selfcheck.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { EXPECTED_STRIPE_ACCOUNT_ID } from "@/lib/billing/stripe/connectivity-probe";
import { recordPaidApplicationSmsPackage } from "@/lib/billing/sms-paid-purchase";
import { dispatchStripeWebhookEvent } from "@/lib/billing/stripe/webhook-dispatch";
import type { StripeWebhookObjectSummary } from "@/lib/billing/stripe/webhook-verify";
import type { WebhookSyncStore } from "@/lib/billing/stripe/webhook-sync";
import {
  assertAuthoritativeLiveSubscription,
  evaluateStripeWebhookAuthority,
  isAuthoritativeLiveStripeMode,
  isLocalNoCardTrialSubscription,
  isProductionSubscriptionAuthority,
  normalizeProviderMode,
} from "@/lib/billing/stripe/provider-mode";
import { resolveChurchEntitlementSource } from "@/lib/subscriptions/entitlement-resolution";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function readSource(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

const WRONG_ACCOUNT = "acct_1UGx3gRpikFGVYxt";

/** Simulates the subscription lookup: only authoritative rows count as "current". */
function entitlementFor(row: {
  status: string;
  billingProvider: string | null;
  billingSubscriptionId: string | null;
  providerMode: string | null;
}) {
  const hasCurrentSubscription = isProductionSubscriptionAuthority(row);
  return resolveChurchEntitlementSource({
    hasCurrentSubscription,
    currentStatus: hasCurrentSubscription ? row.status : null,
    latestStatus: null,
  });
}

function throwingFake<T extends object>(label: string): T {
  return new Proxy({} as T, {
    get(_target, prop) {
      throw new Error(`${label} must not be touched (accessed ${String(prop)})`);
    },
  });
}

async function main() {
  const testStripeRow = {
    status: "active",
    billingProvider: "stripe",
    billingSubscriptionId: "sub_test_isolation",
    providerMode: "test",
  };
  const liveStripeRow = {
    status: "active",
    billingProvider: "stripe",
    billingSubscriptionId: "sub_live_isolation",
    providerMode: "live",
  };

  // normalizeProviderMode / isAuthoritativeLiveStripeMode sanity
  assert(normalizeProviderMode("live") === "live", "normalize live");
  assert(normalizeProviderMode("test") === "test", "normalize test");
  assert(normalizeProviderMode("LIVE") === null, "normalize is exact (LIVE → null)");
  assert(normalizeProviderMode(null) === null, "normalize null");
  assert(normalizeProviderMode(undefined) === null, "normalize undefined");
  assert(normalizeProviderMode("sandbox") === null, "normalize unknown → null");
  assert(isAuthoritativeLiveStripeMode("live"), "live authoritative");
  assert(!isAuthoritativeLiveStripeMode("test"), "test not authoritative");
  assert(!isAuthoritativeLiveStripeMode(null), "null not authoritative");

  // 1. Test subscription cannot become Production current subscription
  assert(
    isProductionSubscriptionAuthority(testStripeRow) === false,
    "[1] test + stripe sub id must not be production authority",
  );
  assert(
    isProductionSubscriptionAuthority({ ...testStripeRow, status: "trialing" }) ===
      false,
    "[1] test trialing + stripe sub id must not be production authority",
  );
  assert(
    isLocalNoCardTrialSubscription({ ...testStripeRow, status: "trialing" }) === false,
    "[1] test trialing is not a local no-card trial",
  );

  // 2. Test subscription cannot grant paid entitlements
  assert(
    entitlementFor(testStripeRow) !== "current",
    "[2] test subscription must not resolve to current entitlements",
  );
  assert(
    entitlementFor(liveStripeRow) === "current",
    "[2] control: live subscription resolves to current entitlements",
  );
  assert(
    resolveChurchEntitlementSource({
      hasCurrentSubscription: isProductionSubscriptionAuthority(testStripeRow),
      latestStatus: null,
    }) !== "current",
    "[2] hasCurrentSubscription false when authority fails",
  );
  const queriesSource = readSource("lib/subscriptions/queries.ts");
  assert(
    queriesSource.includes("isProductionSubscriptionAuthority"),
    "[2] subscription queries apply production authority filter",
  );

  // 3. Test Customer cannot replace authoritative Live Customer (static)
  const customersSource = readSource("lib/billing/stripe/customers.ts");
  assert(
    customersSource.includes("Refusing to overwrite Live Stripe Customer mapping"),
    "[3] customers.ts refuses to overwrite Live Customer mapping",
  );
  assert(
    customersSource.includes('existingProfile?.provider_mode === "live"'),
    "[3] customers.ts detects existing live mapping",
  );

  // 4. Test invoice excluded from Live filter (static)
  const historySource = readSource("lib/billing/history.ts");
  const billingPageSource = readSource("app/(app)/settings/billing/page.tsx");
  assert(
    (historySource.match(/\.eq\("provider_mode", "live"\)/g) ?? []).length >= 1,
    "[4] billing history filters provider_mode = live",
  );
  assert(
    (billingPageSource.match(/\.eq\("provider_mode", "live"\)/g) ?? []).length >= 1,
    "[4] billing page filters provider_mode = live",
  );

  // 5. Failed-payment event from Test mode is ignored at the authority layer
  const failedPaymentAuthority = evaluateStripeWebhookAuthority({ livemode: false });
  assert(failedPaymentAuthority.ok === false, "[5] livemode=false must not be ok");
  assert(
    !failedPaymentAuthority.ok &&
      failedPaymentAuthority.reason === "test_or_wrong_account_event",
    "[5] reason test_or_wrong_account_event",
  );

  // 6. invoice.paid from Test mode ignored (authority + dispatcher gating)
  const invoicePaidAuthority = evaluateStripeWebhookAuthority({
    livemode: false,
    stripeAccountId: EXPECTED_STRIPE_ACCOUNT_ID,
  });
  assert(invoicePaidAuthority.ok === false, "[6] invoice.paid livemode=false ignored");
  assert(
    !invoicePaidAuthority.ok &&
      invoicePaidAuthority.reason === "test_or_wrong_account_event",
    "[6] invoice.paid reason test_or_wrong_account_event",
  );
  assert(
    evaluateStripeWebhookAuthority({ livemode: null }).ok === false,
    "[6] missing livemode fails closed",
  );
  assert(
    evaluateStripeWebhookAuthority({ livemode: undefined }).ok === false,
    "[6] undefined livemode fails closed",
  );
  // Dispatch is gated: a non-live providerMode never touches the store.
  const guardedStore = throwingFake<WebhookSyncStore>("webhook store");
  const fakeObject = { id: "in_test_isolation" } as unknown as StripeWebhookObjectSummary;
  for (const eventType of [
    "invoice.paid",
    "invoice.payment_failed",
    "customer.subscription.deleted",
    "checkout.session.completed",
    "payment_intent.succeeded",
  ]) {
    for (const providerMode of ["test", null] as const) {
      const result = await dispatchStripeWebhookEvent({
        eventType,
        object: fakeObject,
        store: guardedStore,
        providerMode,
      });
      assert(
        result.outcome === "ignored",
        `[6] dispatch ${eventType} providerMode=${providerMode} must be ignored`,
      );
    }
  }

  // 7. Cancellation cannot remove Live access: test/NULL rows rejected before mutation
  for (const providerMode of ["test", null, undefined, "sandbox"] as const) {
    let threw = false;
    try {
      assertAuthoritativeLiveSubscription({
        billingProvider: "stripe",
        billingSubscriptionId: "sub_test_isolation",
        providerMode,
      });
    } catch {
      threw = true;
    }
    assert(threw, `[7] assertAuthoritativeLiveSubscription rejects mode=${providerMode}`);
  }
  let noSubThrew = false;
  try {
    assertAuthoritativeLiveSubscription({
      billingProvider: "stripe",
      billingSubscriptionId: null,
      providerMode: "live",
    });
  } catch {
    noSubThrew = true;
  }
  assert(noSubThrew, "[7] missing stripe subscription id rejected");
  const cancellationSource = readSource("lib/billing/stripe/cancellation.ts");
  assert(
    cancellationSource.includes("assertAuthoritativeLiveSubscription"),
    "[7] cancellation path enforces authoritative live subscription",
  );

  // 8. SMS purchase cannot grant without Live evidence (call with fake: rpc never reached)
  const smsAdmin = throwingFake<SupabaseClient>("sms admin client");
  for (const providerMode of ["test", null, undefined] as const) {
    let rejected = false;
    try {
      await recordPaidApplicationSmsPackage(smsAdmin, {
        organizationId: "org_selfcheck",
        segments: 50,
        amountCents: 1000,
        idempotencyKey: "isolation-selfcheck",
        providerMode,
      });
    } catch (error) {
      rejected =
        error instanceof Error &&
        error.message.includes("Live Stripe payment evidence");
    }
    assert(rejected, `[8] recordPaid refuses providerMode=${providerMode}`);
  }
  const smsSource = readSource("lib/billing/sms-paid-purchase.ts");
  assert(
    smsSource.includes('params.providerMode !== "live"'),
    "[8] sms-paid-purchase requires live provider mode",
  );
  const dispatchSource = readSource("lib/billing/stripe/webhook-dispatch.ts");
  assert(
    dispatchSource.includes("requires Live Stripe payment evidence"),
    "[8] replenishment settlement requires live evidence",
  );

  // 9. Live subscription still grants
  assert(
    isProductionSubscriptionAuthority(liveStripeRow) === true,
    "[9] live + active + stripe id is production authority",
  );
  assert(
    isProductionSubscriptionAuthority({ ...liveStripeRow, status: "past_due" }) === true,
    "[9] live past_due row remains authority (status gating is separate)",
  );

  // 10. Local no-card trial grants
  const localTrial = {
    status: "trialing",
    billingProvider: null,
    billingSubscriptionId: null,
    providerMode: null,
  };
  assert(isLocalNoCardTrialSubscription(localTrial) === true, "[10] local trial detected");
  assert(isProductionSubscriptionAuthority(localTrial) === true, "[10] local trial grants");
  assert(entitlementFor(localTrial) === "current", "[10] local trial entitlements current");
  assert(
    isLocalNoCardTrialSubscription({ ...localTrial, status: "active" }) === false,
    "[10] non-trialing is not a local trial",
  );

  // 11. Live Customer reuse: getMapped skips test mode (static)
  assert(
    customersSource.includes('profile?.provider_mode !== "test"'),
    "[11] getMappedCustomerId skips test profile mapping",
  );
  assert(
    customersSource.includes('legacy?.provider_mode !== "test"'),
    "[11] getMappedCustomerId skips test legacy mapping",
  );

  // 12. Protected scheduled downgrade intact: live Steward Pro style row stays authoritative
  const stewardProLive = {
    status: "active",
    billingProvider: "stripe",
    billingSubscriptionId: "sub_live_steward_pro",
    providerMode: "live",
  };
  assert(
    isProductionSubscriptionAuthority(stewardProLive) === true,
    "[12] live Steward Pro style row remains authority",
  );
  let downgradeAccepted = true;
  try {
    assertAuthoritativeLiveSubscription(stewardProLive);
  } catch {
    downgradeAccepted = false;
  }
  assert(downgradeAccepted, "[12] live row accepted by mutation guard");
  const downgradeSource = readSource("lib/billing/stripe/downgrade.ts");
  assert(
    downgradeSource.includes("assertAuthoritativeLiveSubscription") ||
      downgradeSource.includes("isAuthoritativeLiveStripeMode"),
    "[12] downgrade path requires live subscription",
  );
  // The protected schedule id lives only in ops docs/scripts, never in app code.
  for (const file of [
    "lib/billing/stripe/provider-mode.ts",
    "lib/billing/stripe/downgrade.ts",
    "lib/billing/stripe/webhook-sync.ts",
    "lib/billing/stripe/customers.ts",
  ]) {
    assert(
      !readSource(file).includes("sub_sched_1UW9rvRxaGtyRkAVCvtfVzYe"),
      `[12] protected schedule id must not be hard-coded in ${file}`,
    );
  }

  // 13. Duplicate/idempotency unchanged at the authority layer
  const liveAuthority = evaluateStripeWebhookAuthority({ livemode: true });
  assert(liveAuthority.ok === true, "[13] live event authority ok");
  const liveAuthorityAgain = evaluateStripeWebhookAuthority({ livemode: true });
  assert(
    JSON.stringify(liveAuthority) === JSON.stringify(liveAuthorityAgain),
    "[13] authority decision is deterministic across duplicates",
  );
  assert(
    liveAuthority.ok && liveAuthority.providerMode === "live",
    "[13] live authority providerMode live",
  );

  // 14. UNKNOWN mode fails closed
  assert(
    isProductionSubscriptionAuthority({
      status: "active",
      billingProvider: "stripe",
      billingSubscriptionId: "sub_unknown_mode",
      providerMode: null,
    }) === false,
    "[14] NULL mode + stripe sub id fails closed",
  );
  assert(
    isProductionSubscriptionAuthority({
      status: "trialing",
      billingProvider: "stripe",
      billingSubscriptionId: "sub_unknown_mode",
      providerMode: null,
    }) === false,
    "[14] NULL mode trialing + stripe sub id fails closed",
  );
  assert(
    isProductionSubscriptionAuthority({
      status: "active",
      billingProvider: "stripe",
      billingSubscriptionId: "sub_unknown_mode",
      providerMode: "garbage",
    }) === false,
    "[14] unrecognized mode fails closed",
  );

  // Wrong account
  const wrongAccount = evaluateStripeWebhookAuthority({
    livemode: true,
    stripeAccountId: WRONG_ACCOUNT,
  });
  assert(wrongAccount.ok === false, "[wrong-account] mismatched acct rejected");
  assert(
    !wrongAccount.ok && wrongAccount.reason === "test_or_wrong_account_event",
    "[wrong-account] reason test_or_wrong_account_event",
  );
  const wrongAccountDefault = evaluateStripeWebhookAuthority({
    livemode: true,
    stripeAccountId: "acct_not_ours",
  });
  assert(wrongAccountDefault.ok === false, "[wrong-account] default expected mismatch");

  // Direct account: NULL account with livemode true → ok
  const directNull = evaluateStripeWebhookAuthority({
    livemode: true,
    stripeAccountId: null,
  });
  assert(directNull.ok === true, "[direct-account] NULL account + livemode ok");
  const directEmpty = evaluateStripeWebhookAuthority({
    livemode: true,
    stripeAccountId: "   ",
  });
  assert(directEmpty.ok === true, "[direct-account] blank account + livemode ok");
  const directMatch = evaluateStripeWebhookAuthority({
    livemode: true,
    stripeAccountId: EXPECTED_STRIPE_ACCOUNT_ID,
  });
  assert(directMatch.ok === true, "[direct-account] matching account ok");

  console.log("stripe live/test isolation self-check passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
