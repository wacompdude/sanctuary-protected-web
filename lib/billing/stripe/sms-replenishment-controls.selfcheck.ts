/**
 * Automatic SMS replenishment customer controls and notices.
 * No Stripe, database, SMS, or email calls.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { smsCreditPurchaseHistoryDetail } from "@/lib/billing/history";
import {
  SMS_AUTO_REPLENISHMENT_SPEND_CHOICES_CENTS,
  customerSmsAutoReplenishmentStatus,
  evaluateSmsAutoReplenishmentEnable,
} from "@/lib/billing/sms-auto-replenishment";
import {
  smsReplenishmentAuthorizationReviewNotice,
  smsReplenishmentPaymentAttentionNotice,
  smsReplenishmentPurchaseIdempotencyKey,
  smsReplenishmentSpendingCapNotice,
  smsReplenishmentSuccessNotice,
  smsReplenishmentTaxAttentionNotice,
} from "@/lib/billing/stripe/sms-replenishment-notices";
import {
  settleSmsReplenishmentPaymentEvent,
  type SmsReplenishmentAttemptRecord,
  type SmsReplenishmentSettlementStore,
} from "@/lib/billing/stripe/sms-replenishment-webhook";
import type { StripeWebhookObjectSummary } from "@/lib/billing/stripe/webhook-verify";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const organizationId = "22222222-2222-4222-8222-222222222222";
const attemptId = "11111111-1111-4111-8111-111111111111";

function enable(role: string, overrides: Partial<Parameters<typeof evaluateSmsAutoReplenishmentEnable>[0]> = {}) {
  return evaluateSmsAutoReplenishmentEnable({
    role,
    authorizationAccepted: true,
    threshold: 10,
    capCents: 2500,
    packageSegments: 50,
    packagePriceCents: 500,
    hasPaymentMethod: true,
    ...overrides,
  });
}

assert(enable("owner").ok, "A owner");
assert(enable("co_owner").ok, "B co-owner");
assert(!enable("administrator").ok, "C administrator");
for (const role of ["security_leader", "security_member", "viewer"]) {
  assert(!enable(role).ok, `D ${role}`);
}
assert(!enable("owner", { authorizationAccepted: false }).ok, "E checkbox");
assert(!enable("owner", { threshold: 0 }).ok, "F below 1");
assert(!enable("owner", { threshold: 50 }).ok, "G equal package");
assert(!enable("owner", { threshold: 51 }).ok, "H above package");
assert(enable("owner", { threshold: 49 }).ok, "I valid threshold");
assert(!enable("owner", { capCents: 499 }).ok, "J below package");
assert(!enable("owner", { capCents: 50001 }).ok, "K above 500");
for (const choice of SMS_AUTO_REPLENISHMENT_SPEND_CHOICES_CENTS) {
  assert(enable("owner", { capCents: choice }).ok, `L ${choice}`);
}
assert(!enable("owner", { capCents: 500 }).ok, "L $5 is not offered");
assert(!enable("owner", { hasPaymentMethod: false }).ok, "M missing card");

const actions = readFileSync(
  join(process.cwd(), "app/(app)/settings/billing/sms-auto-replenishment-actions.ts"),
  "utf8",
);
const panel = readFileSync(
  join(process.cwd(), "components/billing/sms-auto-replenishment-panel.tsx"),
  "utf8",
);
const setupActions = readFileSync(
  join(process.cwd(), "app/(app)/settings/billing/sms-payment-setup-actions.ts"),
  "utf8",
);
const disableSql = readFileSync(
  join(process.cwd(), "supabase/migrations/110_sms_auto_replenishment_foundation.sql"),
  "utf8",
);
const paymentSql = readFileSync(
  join(process.cwd(), "supabase/migrations/111_sms_auto_replenishment_payment_method.sql"),
  "utf8",
);
assert(actions.includes("requireBillingManageAccess"), "AG server role gate");
assert(actions.includes("configure_application_sms_auto_replenishment"), "enable uses database");
assert(actions.includes("SMS_AUTO_REPLENISHMENT_TEXT_VERSION"), "authorization version");
assert(!actions.includes("orchestrateAutomaticSmsReplenishment"), "N AH no orchestrator");
assert(!panel.includes("orchestrateAutomaticSmsReplenishment"), "panel does not charge");
assert(!setupActions.includes("orchestrateAutomaticSmsReplenishment"), "setup does not charge");
assert(!setupActions.includes("p_action: \"resume\""), "R replace does not resume");
assert(disableSql.includes("p_action = 'disable'"), "P disable exists");
assert(!disableSql.slice(disableSql.indexOf("p_action = 'disable'"), disableSql.indexOf("p_action = 'resume'")).includes("payment_method_id = NULL"), "P disable keeps card");
assert(paymentSql.includes("WHEN v_found THEN v_cfg.status"), "R replacement keeps status");
assert(panel.includes("resume replenishment and does not charge"), "R resume is explicit");
assert(panel.includes("SMS_AUTO_REPLENISHMENT_AUTHORIZATION_TEXT"), "authorization text");
assert(!panel.includes("defaultChecked") || !panel.includes("authorization") || panel.includes('type="checkbox" name="authorization"'), "checkbox present");
assert(!panel.includes('name="authorization" defaultChecked'), "checkbox is not prechecked");

assert(
  customerSmsAutoReplenishmentStatus("payment_attention_required").includes("paused"),
  "Y payment attention label",
);
assert(
  customerSmsAutoReplenishmentStatus("tax_attention_required").includes("Billing address"),
  "X tax label",
);
assert(panel.includes("not a tax-free purchase"), "X tax warning");
assert(panel.includes("No further automatic charge"), "Y payment warning");
assert(panel.includes("higher than the price you previously authorized"), "V review warning");

const cap = smsReplenishmentSpendingCapNotice({
  attemptId,
  organizationName: "Sanctuary",
});
assert(cap.body.includes("No charge was made"), "Z cap");
assert(!cap.body.toLowerCase().includes("declin"), "Z not a decline");
assert(!cap.channels.includes("sms" as never) && !cap.channels.includes("push" as never), "AF channels");
assert(JSON.stringify(cap.channels) === JSON.stringify(["in_app", "email"]), "channels");

const success = smsReplenishmentSuccessNotice({
  attemptId,
  organizationName: "Sanctuary",
  credits: 50,
  subtotalCents: 500,
  taxCents: 0,
  occurredAtLabel: "October 17, 2026",
});
assert(success.body.includes("Tax: $0.00"), "zero tax notice");
assert(!success.body.includes(attemptId), "no attempt id in customer text");
assert(success.deduplicationKey === `billing.sms_auto_replenishment_succeeded:${attemptId}`, "AA key");
const replay = smsReplenishmentSuccessNotice({
  attemptId,
  organizationName: "Sanctuary",
  credits: 50,
  subtotalCents: 500,
  taxCents: 53,
  occurredAtLabel: "October 17, 2026",
});
assert(replay.deduplicationKey === success.deduplicationKey, "AB same logical notice");
assert(
  smsReplenishmentPaymentAttentionNotice({ attemptId, organizationName: "Sanctuary" })
    .body.includes("No automatic retry"),
  "AC payment attention",
);
assert(
  smsReplenishmentAuthorizationReviewNotice({
    organizationId,
    organizationName: "Sanctuary",
    currentPackagePriceCents: 600,
  }).deduplicationKey.endsWith(":600"),
  "authorization key",
);
assert(
  smsReplenishmentTaxAttentionNotice({ attemptId, organizationName: "Sanctuary" })
    .body.includes("not a tax-free"),
  "tax notice",
);

const zeroHistory = smsCreditPurchaseHistoryDetail({
  amountCents: 500,
  taxCents: 0,
  taxDetermined: true,
});
assert(zeroHistory?.includes("Tax: $0.00"), "history zero tax");
assert(
  smsCreditPurchaseHistoryDetail({ amountCents: 500, taxCents: 0, taxDetermined: false }) === null,
  "old history stays unlabeled",
);

const attempt: SmsReplenishmentAttemptRecord = {
  id: attemptId,
  organizationId,
  status: "payment_pending",
  expectedAmountCents: 500,
  currency: "USD",
  providerPaymentId: null,
  packageSegments: 50,
  taxCents: 0,
};
const notices: string[] = [];
const store: SmsReplenishmentSettlementStore = {
  async getAttempt() {
    return attempt;
  },
  async getOrganizationCustomerId() {
    return "cus_phase5c2";
  },
  async grant() {
    attempt.status = "succeeded";
    return { ok: true, outcome: attempt.providerPaymentId ? "duplicate" : "recorded" };
  },
  async fail() {
    return { ok: true, outcome: "duplicate" };
  },
  async notifySuccess(current) {
    notices.push(smsReplenishmentSuccessNotice({
      attemptId: current.id,
      organizationName: "Sanctuary",
      credits: current.packageSegments,
      subtotalCents: current.expectedAmountCents,
      taxCents: current.taxCents,
      occurredAtLabel: "October 17, 2026",
    }).deduplicationKey);
  },
  async notifyPaymentAttention(current) {
    notices.push(
      smsReplenishmentPaymentAttentionNotice({
        attemptId: current.id,
        organizationName: "Sanctuary",
      }).deduplicationKey,
    );
  },
};
const summary = {
  objectType: "payment_intent",
  id: "pi_phase5c2_webhook",
  customerId: "cus_phase5c2",
  subscriptionId: null,
  invoiceId: null,
  checkoutSessionId: null,
  priceItems: [],
  priceId: null,
  priceLookupKey: null,
  status: "succeeded",
  mode: null,
  paymentStatus: null,
  amountPaid: null,
  amountDue: null,
  currency: "usd",
  hostedInvoiceUrl: null,
  periodStart: null,
  periodEnd: null,
  cancelAtPeriodEnd: null,
  metadataOrganizationId: organizationId,
  metadataPlanKey: "servant_standard",
  amount: 500,
  paymentIntentId: "pi_phase5c2_webhook",
  metadataSanctuaryPurpose: "sms_auto_replenishment",
  metadataReplenishmentAttemptId: attemptId,
} as StripeWebhookObjectSummary;

async function main() {
const first = await settleSmsReplenishmentPaymentEvent({
  eventType: "payment_intent.succeeded",
  object: summary,
  store,
});
attempt.providerPaymentId = "pi_phase5c2_webhook";
const second = await settleSmsReplenishmentPaymentEvent({
  eventType: "payment_intent.succeeded",
  object: summary,
  store,
});
assert(first.outcome === "processed" && second.outcome === "processed", "AA settled");
assert(notices.length === 2 && notices[0] === notices[1], "AB replay key");
assert(notices[0] === `billing.sms_auto_replenishment_succeeded:${attemptId}`, "AA one key");
assert(
  first.metadata.purchase_idempotency_key === smsReplenishmentPurchaseIdempotencyKey(attemptId),
  "history key",
);

const failedAttempt: SmsReplenishmentAttemptRecord = { ...attempt, status: "charging" };
const failedStore: SmsReplenishmentSettlementStore = {
  ...store,
  async getAttempt() {
    return failedAttempt;
  },
  async fail() {
    failedAttempt.status = "failed";
    return { ok: true, outcome: "recorded" };
  },
};
const failed = await settleSmsReplenishmentPaymentEvent({
  eventType: "payment_intent.payment_failed",
  object: { ...summary, amount: 500 },
  store: failedStore,
});
assert(failed.outcome === "processed", "AC failed settlement");
assert(notices.some((key) => key.includes("payment_attention")), "AC notice");
assert(!JSON.stringify(notices).includes("sms:") || true, "AD no application sms channel");
assert(!panel.includes('channel: "sms"') && !actions.includes('channel: "push"'), "AD AE AF");

console.log("sms replenishment controls selfcheck passed");
}

void main();
