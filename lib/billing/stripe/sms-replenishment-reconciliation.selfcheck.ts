/**
 * SMS replenishment reconciliation self-check.
 * No Stripe, database, Bird, or live SMS.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  classifySmsReplenishmentReconciliationOutcome,
  runSmsReplenishmentReconciliation,
  selectSmsReplenishmentReconciliationCandidates,
  SMS_REPLENISHMENT_RECONCILIATION_BATCH_SIZE,
  SMS_REPLENISHMENT_RECONCILIATION_SOURCE,
  type SmsReplenishmentReconciliationConfigRow,
} from "@/lib/billing/stripe/sms-replenishment-reconciliation";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function readRepo(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

const orgA = "11111111-1111-4111-8111-111111111111";
const orgB = "22222222-2222-4222-8222-222222222222";
const orgC = "33333333-3333-4333-8333-333333333333";
const orgD = "44444444-4444-4444-8444-444444444444";
const orgE = "55555555-5555-4555-8555-555555555555";
const orgF = "66666666-6666-4666-8666-666666666666";
const orgG = "77777777-7777-4777-8777-777777777777";

function row(
  overrides: Partial<SmsReplenishmentReconciliationConfigRow> & {
    organizationId: string;
  },
): SmsReplenishmentReconciliationConfigRow {
  return {
    status: "enabled",
    thresholdSegments: 49,
    paymentMethodId: "pm_test",
    purchasedBalance: 10,
    purchasedReserved: 0,
    ...overrides,
  };
}

function selectionBehavior() {
  const selected = selectSmsReplenishmentReconciliationCandidates(
    [
      row({ organizationId: orgB, purchasedBalance: 99 }),
      row({ organizationId: orgA, purchasedBalance: 10 }),
      row({ organizationId: orgC, status: "disabled", purchasedBalance: 0 }),
      row({
        organizationId: orgD,
        status: "payment_attention_required",
        purchasedBalance: 0,
      }),
      row({
        organizationId: orgE,
        status: "tax_attention_required",
        purchasedBalance: 0,
      }),
      row({
        organizationId: orgF,
        status: "authorization_review_required",
        purchasedBalance: 0,
      }),
      row({ organizationId: orgG, purchasedBalance: 5 }),
    ],
    new Set([orgG]),
    50,
  );
  assert(selected[0] === orgA, "13 deterministic org order");
  assert(selected.includes(orgA), "5 enabled low-balance selected");
  assert(!selected.includes(orgB), "6 above-threshold purchased available excluded");
  assert(!selected.includes(orgC), "7 disabled excluded");
  assert(!selected.includes(orgD), "8 payment_attention excluded");
  assert(!selected.includes(orgE), "9 tax_attention excluded");
  assert(!selected.includes(orgF), "10 authorization_review excluded");
  assert(!selected.includes(orgG), "11 open attempt excluded");

  const bounded = selectSmsReplenishmentReconciliationCandidates(
    Array.from({ length: 60 }, (_, index) =>
      row({
        organizationId: `aaaaaaaa-aaaa-4aaa-8aaa-${String(index).padStart(12, "0")}`,
        purchasedBalance: 1,
      }),
    ),
    new Set(),
    25,
  );
  assert(bounded.length === 25, "12 bounded batch size respected");
  assert(
    SMS_REPLENISHMENT_RECONCILIATION_BATCH_SIZE === 50,
    "12 default batch size 50 matches dispatch convention",
  );
}

async function isolationBehavior() {
  const calls: string[] = [];
  const summary = await runSmsReplenishmentReconciliation({
    candidates: [orgA, orgB, orgC],
    log: () => undefined,
    orchestrate: async (organizationId) => {
      calls.push(organizationId);
      if (organizationId === orgB) throw new Error("boom");
      if (organizationId === orgA) {
        return { outcome: "above_threshold", attemptId: null };
      }
      return { outcome: "awaiting_settlement", attemptId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" };
    },
  });

  assert(calls.join(",") === `${orgA},${orgB},${orgC}`, "14 continues after org error");
  assert(summary.outcomes.error === 1, "14 error counted");
  assert(summary.outcomes.above_threshold === 1, "6 no-op counted");
  assert(summary.outcomes.awaiting_settlement === 1, "15 awaiting settlement counted");
  assert(summary.status === "partial", "14 partial status");
  assert(summary.candidateCount === 3, "processed candidate count");
  assert(
    classifySmsReplenishmentReconciliationOutcome("payment_attention_required") ===
      "attention",
    "attention bucket",
  );
  assert(
    classifySmsReplenishmentReconciliationOutcome("period_cap_reached") === "period_cap",
    "cap bucket",
  );
  assert(
    classifySmsReplenishmentReconciliationOutcome("payment_pending") === "started",
    "started bucket",
  );
  assert(SMS_REPLENISHMENT_RECONCILIATION_SOURCE === "reconciliation_cron", "source");
}

function sourceWiring() {
  const root = process.cwd();
  const core = readRepo("lib/billing/stripe/sms-replenishment-reconciliation.ts");
  const live = readRepo("lib/billing/stripe/sms-replenishment-reconciliation-live.ts");
  const route = readRepo("app/api/internal/cron/sms-replenishment/route.ts");
  const vercel = readRepo("vercel.json");
  const triggerLive = readRepo("lib/billing/stripe/sms-replenishment-trigger-live.ts");
  const dispatch = readRepo("lib/notifications/dispatch-notification.ts");
  const webhook = readRepo("lib/billing/stripe/sms-replenishment-webhook.ts");
  const mfa = readRepo("lib/mfa/send-sms.ts");

  assert(!core.includes('import "server-only"'), "core testable");
  assert(!core.includes("getStripeClient"), "17 no Stripe in core");
  assert(!core.includes("orchestrateAutomaticSmsReplenishment"), "16 core does not bind live");
  assert(live.includes('import "server-only"'), "live server-only");
  assert(live.includes("orchestrateAutomaticSmsReplenishment"), "16 live calls orchestrator");
  assert(!live.includes("getStripeClient"), "17 live no Stripe");
  assert(!live.includes("tax.calculations"), "17 no tax");
  assert(!live.includes("paymentIntents"), "17 no PI");
  assert(!live.includes("record_automatic_application_sms_replenishment"), "18 no grant");
  assert(!live.includes("sendBirdSms") && !live.includes("sendSmsDelivery"), "19 no SMS");
  assert(!live.includes("configure_application_sms_auto_replenishment"), "21 no config mutation");
  assert(!live.includes("p_action"), "21-25 no config actions");
  assert(!mfa.includes("reconcileAutomaticSmsReplenishment"), "20 no MFA");

  assert(route.includes("authorizeRequest"), "1 auth gate");
  assert(route.includes("CRON_SECRET"), "2 cron secret");
  assert(route.includes("NOTIFICATION_DISPATCH_SECRET"), "2 dispatch secret convention");
  assert(route.includes('status: 401'), "2 unauthorized");
  assert(route.includes("reconcileAutomaticSmsReplenishment"), "1 authorized invokes reconciler");
  assert(!route.includes("organizationId"), "3 no org param");
  assert(!route.includes("amount") && !route.includes("packageKey"), "4 no financial params");
  assert(route.includes("candidateCount") && route.includes("outcomes"), "safe summary");
  assert(!route.includes("payment_method") && !route.includes("customer"), "safe fields");

  assert(vercel.includes('"/api/internal/cron/sms-replenishment"'), "29 schedule path");
  assert(vercel.includes('"*/10 * * * *"'), "29 every 10 minutes");
  assert(vercel.includes('"/api/notifications/dispatch"'), "28 dispatch preserved");
  assert(vercel.includes('"/api/notifications/certifications/scan"'), "28 certs preserved");
  assert(vercel.includes('"/api/notifications/safety-concerns/scan"'), "28 safety preserved");
  assert(vercel.includes('"/api/notifications/schedule/scan"'), "28 schedule preserved");
  assert(
    vercel.includes('"/api/notifications/billing/card-expiration"'),
    "28 card-expiration preserved",
  );

  assert(
    dispatch.includes("scheduleAutomaticSmsReplenishmentAfterCommit"),
    "26 post-commit intact",
  );
  assert(triggerLive.includes("after("), "26 after intact");
  assert(webhook.includes("settleSmsReplenishmentPaymentEvent") || webhook.includes("record_automatic") || readRepo("lib/billing/stripe/sms-replenishment-store.ts").includes("record_automatic_application_sms_replenishment"), "27 webhook grant intact");

  const hits: string[] = [];
  function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".next" || entry.name === ".git") continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(path);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(entry.name)) continue;
      const text = readFileSync(path, "utf8");
      if (text.includes("orchestrateAutomaticSmsReplenishment")) {
        hits.push(path.replace(/\\/g, "/"));
      }
    }
  }
  walk(join(root, "app"));
  assert(hits.length === 0, `30 no app/ API calls orchestrator directly: ${hits.join(", ")}`);
  assert(!route.includes("orchestrateAutomaticSmsReplenishment"), "30 route uses reconciler only");
  assert(
    route.includes("reconcileAutomaticSmsReplenishment"),
    "30 route invokes reconciliation module",
  );
}

async function main() {
  selectionBehavior();
  await isolationBehavior();
  sourceWiring();
  console.log("sms replenishment reconciliation selfcheck passed");
}

void main();
