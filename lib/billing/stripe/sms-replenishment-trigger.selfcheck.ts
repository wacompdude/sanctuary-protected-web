/**
 * Post-commit SMS replenishment trigger self-check.
 * No Stripe, database, Bird, or live SMS.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  runAutomaticSmsReplenishmentTrigger,
  scheduleAutomaticSmsReplenishmentAfterCommit,
  SMS_REPLENISHMENT_TRIGGER_SOURCE,
} from "@/lib/billing/stripe/sms-replenishment-trigger";
import type { SmsReplenishmentOrchestrationResult } from "@/lib/billing/stripe/sms-replenishment-orchestrator";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function readRepo(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

const organizationId = "a5246f30-84dc-4f8e-b27f-03390e8cadbe";

function stopped(outcome: string): SmsReplenishmentOrchestrationResult {
  return { outcome, attemptId: null, grantsCredits: false, providerPaymentId: null };
}

async function isolationDoesNotThrow() {
  const logs: Array<Record<string, unknown>> = [];
  const scheduled: Array<() => void | Promise<void>> = [];

  scheduleAutomaticSmsReplenishmentAfterCommit(organizationId, {
    schedule: (work) => {
      scheduled.push(work);
    },
    orchestrate: async () => stopped("above_threshold"),
    log: (payload) => logs.push(payload),
  });
  assert(scheduled.length === 1, "1 successful commit schedules one opportunity");
  await scheduled[0]!();
  assert(logs.some((row) => row.outcome === "above_threshold"), "13 above_threshold logged");

  const outcomes = [
    "payment_attention_required",
    "tax_attention_required",
    "authorization_review_required",
    "awaiting_settlement",
    "not_enabled",
    "payment_pending",
  ] as const;
  for (const outcome of outcomes) {
    await runAutomaticSmsReplenishmentTrigger(organizationId, {
      orchestrate: async () =>
        outcome === "payment_pending"
          ? {
              outcome,
              attemptId: "11111111-1111-4111-8111-111111111111",
              grantsCredits: false,
              providerPaymentId: "pi_test",
            }
          : stopped(outcome),
      log: (payload) => logs.push(payload),
    });
  }
  assert(
    logs.some((row) => row.outcome === "payment_attention_required"),
    "14 payment_attention no-op logged",
  );
  assert(logs.some((row) => row.outcome === "tax_attention_required"), "15 tax_attention");
  assert(
    logs.some((row) => row.outcome === "authorization_review_required"),
    "16 authorization_review",
  );
  assert(logs.some((row) => row.outcome === "awaiting_settlement"), "17 awaiting_settlement");

  let throws = 0;
  await runAutomaticSmsReplenishmentTrigger(organizationId, {
    orchestrate: async () => {
      throws += 1;
      throw new Error("orchestrator boom");
    },
    log: (payload) => logs.push(payload),
  });
  assert(throws === 1, "12 orchestrator threw");
  assert(logs.some((row) => row.errorName === "Error"), "12 throw isolated and logged");

  await runAutomaticSmsReplenishmentTrigger(organizationId, {
    orchestrate: async () => ({
      outcome: "payment_pending",
      attemptId: "22222222-2222-4222-8222-222222222222",
      grantsCredits: false,
      providerPaymentId: "pi_test_2",
    }),
    log: (payload) => logs.push(payload),
  });
  assert(
    logs.some(
      (row) =>
        row.outcome === "payment_pending" &&
        row.attemptId === "22222222-2222-4222-8222-222222222222",
    ),
    "11 success path logs attemptId",
  );

  const concurrent: Array<() => void | Promise<void>> = [];
  for (let i = 0; i < 10; i += 1) {
    scheduleAutomaticSmsReplenishmentAfterCommit(organizationId, {
      schedule: (work) => concurrent.push(work),
      orchestrate: async () => stopped("open_attempt_exists"),
      log: () => undefined,
    });
  }
  assert(concurrent.length === 10, "18 at-least-once concurrent schedules allowed");
  for (const work of concurrent) await work();

  await runAutomaticSmsReplenishmentTrigger("not-a-uuid", {
    orchestrate: async () => {
      throw new Error("must not run");
    },
    log: (payload) => logs.push(payload),
  });
  assert(
    logs.some((row) => row.errorName === "invalid_organization_id"),
    "8 invalid org id rejected",
  );

  assert(SMS_REPLENISHMENT_TRIGGER_SOURCE === "post_commit", "source constant");
}

function sourceWiring() {
  const root = process.cwd();
  const core = readRepo("lib/billing/stripe/sms-replenishment-trigger.ts");
  const live = readRepo("lib/billing/stripe/sms-replenishment-trigger-live.ts");
  const dispatch = readRepo("lib/notifications/dispatch-notification.ts");
  const create = readRepo("lib/notifications/create-notification.ts");
  const birdWebhook = readRepo("lib/sms/process-bird-webhook.ts");
  const mfa = readRepo("lib/mfa/send-sms.ts");
  const verify = readRepo("lib/sms/verify.ts");
  const orchestratorLive = readRepo("lib/billing/stripe/sms-replenishment-orchestrator-live.ts");
  const vercel = readRepo("vercel.json");

  assert(!core.includes('import "server-only"'), "core stays importable for tests");
  assert(!core.includes("getStripeClient"), "19 core no Stripe");
  assert(!core.includes("orchestrateAutomaticSmsReplenishment"), "10 core does not bind live");
  assert(live.includes('import "server-only"'), "live is server-only");
  assert(live.includes('from "next/server"'), "6 after import");
  assert(live.includes("after("), "6 after usage");
  assert(live.includes("orchestrateAutomaticSmsReplenishment"), "10 live calls orchestrator");
  assert(!live.includes("getStripeClient"), "19 live no direct Stripe");
  assert(!live.includes("tax.calculations"), "19 no tax create");
  assert(!live.includes("paymentIntents"), "19 no PI");
  assert(!live.includes("record_automatic_application_sms_replenishment"), "20 no grant");
  assert(!live.includes("sendBirdSms"), "21 no Application SMS");
  assert(!live.includes("sendSmsDelivery"), "21 no dispatch send");
  assert(
    /export function scheduleAutomaticSmsReplenishmentAfterCommit\(\s*organizationId: string/.test(
      live,
    ),
    "9 16 live accepts only organizationId",
  );
  assert(!live.includes("amountCents"), "17 no amount");
  assert(!live.includes("packageKey"), "17 no package");
  assert(!live.includes("paymentMethod"), "17 no PM");

  const commitFn = dispatch.slice(dispatch.indexOf("async function commitAcceptedSms"));
  const commitBody = commitFn.slice(
    0,
    commitFn.indexOf("\nasync function loadAcceptedSmsAwaitingCommit"),
  );
  assert(commitBody.includes("commitApplicationSmsSegments"), "2 authoritative commit RPC");
  assert(
    commitBody.indexOf("commitApplicationSmsSegments") <
      commitBody.indexOf("scheduleAutomaticSmsReplenishmentAfterCommit"),
    "2 9 trigger after commit",
  );
  assert(
    commitBody.includes("scheduleAutomaticSmsReplenishmentAfterCommit(delivery.organization_id)"),
    "8 org from delivery",
  );
  assert(
    dispatch.includes('from "@/lib/billing/stripe/sms-replenishment-trigger-live"'),
    "dispatch uses live binder",
  );
  assert(
    commitBody.indexOf("if (!smsCommitSucceeded(committed))") <
      commitBody.indexOf("scheduleAutomaticSmsReplenishmentAfterCommit") &&
      commitBody.includes('return "failed"'),
    "5 commit failure does not schedule",
  );

  const sendFn = dispatch.slice(dispatch.indexOf("export async function sendSmsDelivery"));
  assert(sendFn.includes("reserveApplicationSmsSegments"), "3 reserve present");
  assert(
    !sendFn
      .slice(
        sendFn.indexOf("reserveApplicationSmsSegments"),
        sendFn.indexOf("await provider.send"),
      )
      .includes("scheduleAutomaticSmsReplenishmentAfterCommit"),
    "3 reservation alone does not trigger",
  );
  assert(
    sendFn.includes("releaseApplicationSmsSegments") &&
      !sendFn
        .slice(sendFn.indexOf("if (!sendResult.ok)"), sendFn.indexOf("const permanent"))
        .includes("scheduleAutomaticSmsReplenishmentAfterCommit"),
    "4 Bird failure path does not schedule",
  );

  assert(!birdWebhook.includes("scheduleAutomaticSmsReplenishmentAfterCommit"), "6 webhook no trigger");
  assert(!birdWebhook.includes("orchestrateAutomaticSmsReplenishment"), "6 webhook no orchestrator");
  assert(!mfa.includes("scheduleAutomaticSmsReplenishmentAfterCommit"), "22 MFA isolated");
  assert(!mfa.includes("orchestrateAutomaticSmsReplenishment"), "22 MFA no orchestrator");
  assert(!verify.includes("scheduleAutomaticSmsReplenishmentAfterCommit"), "22 OTP/HELP isolated");

  assert(create.includes('from "next/server"') && create.includes("after("), "R create uses after");
  assert(!vercel.includes("sms-auto-replenishment"), "31 no temporary test route schedule");
  assert(
    !vercel.includes("sms-replenishment"),
    "31 reconciliation schedule deferred (Hobby daily-only cron limit)",
  );


  assert(
    orchestratorLive.includes("post-commit Application SMS trigger"),
    "permanent caller documented",
  );

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
      if (
        text.includes("sms-replenishment-trigger-live") ||
        text.includes("orchestrateAutomaticSmsReplenishment")
      ) {
        hits.push(path.replace(/\\/g, "/"));
      }
    }
  }
  walk(join(root, "app"));
  assert(
    hits.filter((path) => path.includes("/api/")).length === 0,
    `23 no public API caller: ${hits.join(", ")}`,
  );

  assert(!readRepo("package.json").includes("SMS_REPLENISHMENT_TEST"), "30 no test secret");
}

async function main() {
  await isolationDoesNotThrow();
  sourceWiring();
  console.log("sms replenishment trigger selfcheck passed");
}

void main();
