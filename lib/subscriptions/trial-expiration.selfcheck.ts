/**
 * Stage 3C local no-card trial expiration self-check (no database, no Stripe).
 * Run: npx --yes tsx lib/subscriptions/trial-expiration.selfcheck.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveChurchEntitlementSource } from "@/lib/subscriptions/entitlement-resolution";
import {
  isLocalNoCardTrialExpired,
  isTrialActive,
  subscriptionGrantsAccess,
  subscriptionRecordGrantsAccess,
} from "@/lib/subscriptions/status";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const NOW = new Date("2026-11-04T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

function localTrial(trialEnd: string | null) {
  return {
    status: "trialing" as const,
    trialEnd,
    billingProvider: null as string | null,
    billingSubscriptionId: null as string | null,
    providerMode: null as string | null,
  };
}

function livePaid(status: string) {
  return {
    status,
    trialEnd: "2020-01-01T00:00:00.000Z",
    billingProvider: "stripe",
    billingSubscriptionId: "sub_live_fixture",
    providerMode: "live",
  };
}

function liveStripeTrial(trialEnd: string) {
  return {
    status: "trialing" as const,
    trialEnd,
    billingProvider: "stripe",
    billingSubscriptionId: "sub_live_trial",
    providerMode: "live",
  };
}

// 1. Trial begins / day 1 active
assert(
  subscriptionRecordGrantsAccess(
    localTrial(new Date(NOW.getTime() + 7 * DAY).toISOString()),
    NOW,
  ),
  "[1] day-1 local trial grants access",
);

// 2–3. Active immediately before expiration
const justBefore = new Date(NOW.getTime() + 1000).toISOString();
assert(
  isTrialActive({ status: "trialing", trialEnd: justBefore, now: NOW }),
  "[2] trial active immediately before expiration",
);
assert(
  subscriptionRecordGrantsAccess(localTrial(justBefore), NOW),
  "[3] record grants immediately before expiration",
);

// 4. Exact expiration timestamp still grants (inclusive end)
assert(
  isTrialActive({
    status: "trialing",
    trialEnd: NOW.toISOString(),
    now: NOW,
  }),
  "[4] exact expiration timestamp remains active",
);

// 5. One second after expiration
const oneSecondAfter = new Date(NOW.getTime() + 1000);
assert(
  !isTrialActive({
    status: "trialing",
    trialEnd: NOW.toISOString(),
    now: oneSecondAfter,
  }),
  "[5] expired one second after trial_end",
);
assert(
  !subscriptionRecordGrantsAccess(localTrial(NOW.toISOString()), oneSecondAfter),
  "[5] record denies one second after",
);

// 6. Expired several days ago
assert(
  !subscriptionRecordGrantsAccess(
    localTrial(new Date(NOW.getTime() - 5 * DAY).toISOString()),
    NOW,
  ),
  "[6] expired several days ago denies",
);
assert(
  isLocalNoCardTrialExpired(
    localTrial(new Date(NOW.getTime() - 5 * DAY).toISOString()),
    NOW,
  ),
  "[6] isLocalNoCardTrialExpired true",
);

// 7–8. Missing / invalid trial_end fail closed
assert(
  !isTrialActive({ status: "trialing", trialEnd: null, now: NOW }),
  "[7] missing trial_end fails closed",
);
assert(
  !subscriptionRecordGrantsAccess(localTrial(null), NOW),
  "[7] missing trial_end denies record access",
);
assert(
  !isTrialActive({ status: "trialing", trialEnd: "not-a-date", now: NOW }),
  "[8] invalid trial_end fails closed",
);
assert(
  !subscriptionRecordGrantsAccess(localTrial("not-a-date"), NOW),
  "[8] invalid trial_end denies record access",
);

// 9. Status inconsistent with expiration (trialing + past end)
assert(
  subscriptionGrantsAccess("trialing"),
  "[9] status-only helper still lists trialing (legacy)",
);
assert(
  !subscriptionRecordGrantsAccess(
    localTrial(new Date(NOW.getTime() - DAY).toISOString()),
    NOW,
  ),
  "[9] record helper does not trust stale trialing alone",
);

// 10. Browser clock differs — entitlement evaluation uses caller-supplied server now
assert(
  !subscriptionRecordGrantsAccess(
    localTrial(new Date(NOW.getTime() - DAY).toISOString()),
    NOW,
  ),
  "[10] server now denies expired trial",
);
assert(
  subscriptionRecordGrantsAccess(
    localTrial(new Date(NOW.getTime() + DAY).toISOString()),
    NOW,
  ),
  "[10] server now grants unexpired trial",
);

// 14. Valid Stripe paid subscription remains authoritative
assert(
  subscriptionRecordGrantsAccess(livePaid("active"), NOW),
  "[14] live active paid grants",
);
assert(
  subscriptionRecordGrantsAccess(livePaid("past_due"), NOW),
  "[14] live past_due grants",
);
assert(
  !isLocalNoCardTrialExpired(livePaid("active"), NOW),
  "[14] paid live is not a local trial expiry",
);

// Provider-backed Stripe trial: status authoritative (not local no-card)
assert(
  subscriptionRecordGrantsAccess(
    liveStripeTrial(new Date(NOW.getTime() - DAY).toISOString()),
    NOW,
  ),
  "[14b] provider-backed Stripe trial uses status, not local fail-closed end",
);

// 15–17. Test / UNKNOWN fail closed via authority (record helper still status-based;
// production lookup filters via isProductionSubscriptionAuthority).
assert(
  subscriptionRecordGrantsAccess({
    status: "active",
    trialEnd: null,
    billingProvider: "stripe",
    billingSubscriptionId: "sub_test",
    providerMode: "test",
  }),
  "[15] record helper is status-based; Test isolation is at query authority",
);
assert(
  resolveChurchEntitlementSource({
    hasCurrentSubscription: false,
    currentStatus: null,
    currentGrantsAccess: false,
    latestStatus: "trialing",
    latestGrantsAccess: false,
  }) === "none",
  "[17] expired local trial latestGrantsAccess false → none",
);
assert(
  resolveChurchEntitlementSource({
    hasCurrentSubscription: true,
    currentStatus: "trialing",
    currentGrantsAccess: false,
    latestStatus: "trialing",
  }) === "none",
  "[9/17] current row with currentGrantsAccess false → none",
);

// Static wiring: resolver + mobile + manual action
const resolver = readFileSync(
  join(process.cwd(), "lib/subscriptions/resolver.ts"),
  "utf8",
);
assert(
  resolver.includes("subscriptionRecordGrantsAccess"),
  "loadChurchEntitlements uses subscriptionRecordGrantsAccess",
);
const mobile = readFileSync(
  join(process.cwd(), "lib/notifications/mobile-api.ts"),
  "utf8",
);
assert(
  mobile.includes("subscriptionRecordGrantsAccess"),
  "mobile entitlement path uses subscriptionRecordGrantsAccess",
);
const actions = readFileSync(
  join(process.cwd(), "app/(app)/settings/billing/actions.ts"),
  "utf8",
);
assert(
  actions.includes("provider.isConfigured()"),
  "applyPlanWithoutProviderAction checks provider.isConfigured",
);
assert(
  actions.includes("Manual plan assignment is not available"),
  "applyPlanWithoutProviderAction refuses when Stripe configured",
);

console.log("trial expiration self-check passed");
