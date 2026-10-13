/**
 * Static checks for the SMS auto-replenishment foundation.
 * No Stripe, Bird, Supabase, or email calls.
 * Run: npm run selfcheck:sms:auto-replenishment
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { billingHistoryEventTitle } from "@/lib/billing/history";
import { COMMERCIAL_PLAN_CATALOG } from "@/lib/billing/commercial-catalog";
import {
  automaticReplenishmentGrantKey,
  automaticReplenishmentProviderKey,
  canManageSmsAutoReplenishment,
  defaultSmsAutoReplenishmentThreshold,
  packageFitsAutomaticCap,
  priceIncreaseRequiresReauthorization,
  spendCapIsValid,
  SMS_AUTO_REPLENISHMENT_TEXT_VERSION,
  thresholdIsValid,
  totalAvailableQualifies,
} from "@/lib/billing/sms-auto-replenishment";
import { PLAN_KEYS } from "@/lib/subscriptions/plan-keys";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function readRepo(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const migration = readRepo(
  "supabase/migrations/110_sms_auto_replenishment_foundation.sql",
);
const manual = readRepo(
  "supabase/migrations/108_record_paid_application_sms_package.sql",
);
const dispatch = readRepo("lib/notifications/dispatch-notification.ts");
const checkout = readRepo("app/(app)/settings/billing/actions.ts");

assert(
  migration.includes("ALTER COLUMN auto_replenish_enabled SET DEFAULT false"),
  "legacy default becomes false",
);
assert(
  migration.includes("SET auto_replenish_enabled = false"),
  "existing legacy true values are forced false",
);
assert(
  migration.includes("SET balance = balance + v_attempt.package_segments"),
  "grant changes balance only by the package",
);
assert(
  !migration.includes("quantity_used ="),
  "migration does not write included usage",
);
assert(
  migration.includes("'auto_replenish'"),
  "grant ledger reason is auto_replenish",
);
assert(
  !migration.includes("'manual_purchase'"),
  "automatic grant does not use the manual ledger reason",
);
assert(
  manual.includes("'manual_purchase'"),
  "manual grant function remains the manual path",
);
assert(
  !migration.includes("record_paid_application_sms_package"),
  "migration 110 does not replace the manual grant",
);
assert(
  migration.includes("Automatic SMS credit replenishment"),
  "automatic transaction description",
);
assert(
  migration.includes("organization_sms_replenishment_attempts_one_open_uidx"),
  "one open attempt",
);
assert(
  migration.includes("REVOKE ALL ON FUNCTION public.claim_application_sms_replenishment(uuid) FROM authenticated"),
  "authenticated cannot claim",
);
assert(
  migration.includes("GRANT EXECUTE ON FUNCTION public.claim_application_sms_replenishment(uuid) TO service_role"),
  "service role can claim",
);
assert(
  migration.includes("TO service_role"),
  "service role grant present",
);
assert(!migration.includes("checkout.sessions"), "no Checkout");
assert(!migration.includes("paymentIntents"), "no PaymentIntent call");
assert(!migration.includes("setupIntents"), "no SetupIntent call");
assert(!migration.includes("api.stripe.com"), "no Stripe HTTP");
assert(
  !dispatch.includes("claim_application_sms_replenishment"),
  "send path does not claim yet",
);
assert(
  !checkout.includes("configure_application_sms_auto_replenishment"),
  "billing actions do not enable replenishment",
);
assert(
  migration.includes(SMS_AUTO_REPLENISHMENT_TEXT_VERSION),
  "authorization text version",
);
assert(
  migration.includes("auto_purchase_allowed"),
  "catalog flag is documented as not consent",
);
assert(
  migration.includes("Not organization authorization"),
  "catalog comment",
);

assert(canManageSmsAutoReplenishment("owner"), "owner");
assert(canManageSmsAutoReplenishment("co_owner"), "co-owner");
assert(!canManageSmsAutoReplenishment("administrator"), "administrator");
assert(!canManageSmsAutoReplenishment("viewer"), "viewer");

assert(defaultSmsAutoReplenishmentThreshold(PLAN_KEYS.SERVANT_STANDARD) === 10, "servant threshold");
assert(defaultSmsAutoReplenishmentThreshold(PLAN_KEYS.STEWARD_PRO) === 20, "steward threshold");
assert(defaultSmsAutoReplenishmentThreshold(PLAN_KEYS.SHEPHERD_PLUS) === 40, "shepherd threshold");
assert(defaultSmsAutoReplenishmentThreshold(PLAN_KEYS.OMNI_ENTERPRISE) === 100, "omni threshold");

for (const entry of COMMERCIAL_PLAN_CATALOG) {
  assert(
    thresholdIsValid(entry.smsPackageCredits, entry.suggestedLowBalanceThreshold),
    `${entry.planKey} default threshold`,
  );
  assert(
    !thresholdIsValid(entry.smsPackageCredits, entry.smsPackageCredits),
    `${entry.planKey} package size is not a valid threshold`,
  );
  assert(
    spendCapIsValid(entry.smsPackagePriceCents, entry.smsPackagePriceCents),
    `${entry.planKey} minimum cap`,
  );
  assert(!spendCapIsValid(entry.smsPackagePriceCents, entry.smsPackagePriceCents - 1), "cap below package");
  assert(!spendCapIsValid(entry.smsPackagePriceCents, 50_001), "cap above 500 dollars");
}

assert(thresholdIsValid(50, 1) && thresholdIsValid(50, 49), "servant bounds");
assert(!thresholdIsValid(50, 0) && !thresholdIsValid(50, 50), "servant rejects");
assert(totalAvailableQualifies(10, 10), "exact threshold qualifies");
assert(totalAvailableQualifies(9, 10), "below threshold qualifies");
assert(!totalAvailableQualifies(200, 20), "included capacity blocks replenishment");
assert(
  priceIncreaseRequiresReauthorization(500, 1000),
  "price increase",
);
assert(!priceIncreaseRequiresReauthorization(1000, 500), "price decrease");
assert(!priceIncreaseRequiresReauthorization(500, 500), "same price");
assert(
  packageFitsAutomaticCap({
    automaticSpendCents: 0,
    openAttemptCents: 0,
    packagePriceCents: 500,
    maxAutoSpendCents: 500,
  }),
  "exact cap",
);
assert(
  !packageFitsAutomaticCap({
    automaticSpendCents: 500,
    openAttemptCents: 0,
    packagePriceCents: 500,
    maxAutoSpendCents: 500,
  }),
  "over cap",
);
assert(
  packageFitsAutomaticCap({
    automaticSpendCents: 0,
    openAttemptCents: 0,
    packagePriceCents: 500,
    maxAutoSpendCents: 1000,
  }),
  "manual spend is not in this input",
);

const attemptId = "11111111-1111-4111-8111-111111111111";
assert(
  automaticReplenishmentGrantKey(attemptId) === `sms:auto:${attemptId}`,
  "grant key",
);
assert(
  automaticReplenishmentProviderKey(attemptId) === `sms_auto_pi_${attemptId}`,
  "provider key",
);

assert(
  billingHistoryEventTitle({
    eventType: "checkout.session.completed",
    metadata: { handler: { sms_package_purchase: true } },
  }) === "SMS Credit Purchase",
  "manual history label",
);
assert(
  billingHistoryEventTitle({
    eventType: "payment_intent.succeeded",
    metadata: { handler: { sms_auto_replenishment: true } },
  }) === "Automatic SMS Credit Replenishment",
  "automatic history label",
);

console.log("sms auto-replenishment selfcheck passed");
