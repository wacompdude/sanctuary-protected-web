/**
 * Servant SMS entitlement and Bird-accepted commit settlement.
 * No database, Stripe, Bird, or SMS send.
 * Run: npx --yes tsx lib/notifications/sms-acceptance-settlement.selfcheck.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { smsIncludedAllowanceChangeDetail } from "@/lib/billing/downgrade-impact";
import {
  finalizeAcceptedDeliveryPatch,
  providerAcceptancePatch,
  reconciliationPatch,
  SMS_COMMIT_RECONCILIATION_CODE,
  smsCommitSucceeded,
  unknownAcceptancePatch,
  birdOutcomeRecovery,
} from "@/lib/notifications/sms-acceptance-settlement";
import {
  commitApplicationSms,
  createSmsCapacityBooks,
  releaseApplicationSms,
  reserveApplicationSms,
} from "@/lib/sms/sms-capacity";
import type { SmsCapacityResult } from "@/lib/sms/sms-capacity";
import { FEATURE_KEYS } from "@/lib/subscriptions/feature-keys";
import { EXPECTED_PLAN_ENTITLEMENTS } from "@/lib/subscriptions/expected-matrix";
import { PLAN_KEYS } from "@/lib/subscriptions/plan-keys";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function readRepo(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

const NOW = "2026-10-12T07:00:00.000Z";

function result(
  outcome: SmsCapacityResult["outcome"],
  ok: boolean,
  duplicate = false,
): SmsCapacityResult {
  return {
    ok,
    outcome,
    requestedSegments: 1,
    includedSegments: 0,
    purchasedSegments: 1,
    duplicate,
  };
}

const servant = EXPECTED_PLAN_ENTITLEMENTS[PLAN_KEYS.SERVANT_STANDARD];
const steward = EXPECTED_PLAN_ENTITLEMENTS[PLAN_KEYS.STEWARD_PRO];
const shepherd = EXPECTED_PLAN_ENTITLEMENTS[PLAN_KEYS.SHEPHERD_PLUS];
const omni = EXPECTED_PLAN_ENTITLEMENTS[PLAN_KEYS.OMNI_ENTERPRISE];

assert(servant[FEATURE_KEYS.SMS] === true, "1 servant sms enabled");
assert(servant[FEATURE_KEYS.SMS_MONTHLY_SEGMENT_LIMIT] === 0, "2 servant limit 0");
assert(
  steward[FEATURE_KEYS.SMS] === true &&
    steward[FEATURE_KEYS.SMS_MONTHLY_SEGMENT_LIMIT] === 250,
  "3 steward",
);
assert(
  shepherd[FEATURE_KEYS.SMS] === true &&
    shepherd[FEATURE_KEYS.SMS_MONTHLY_SEGMENT_LIMIT] === 500,
  "4 shepherd",
);
assert(
  omni[FEATURE_KEYS.SMS] === true &&
    omni[FEATURE_KEYS.SMS_MONTHLY_SEGMENT_LIMIT] === 1000,
  "5 omni",
);

const churchSettings = readRepo("app/(app)/settings/church/actions.ts");
const webSettings = readRepo("app/(app)/notifications/actions.ts");
const mobileSettings = readRepo("lib/notifications/mobile-api.ts");
assert(
  churchSettings.includes("featureKey: FEATURE_KEYS.SMS") &&
    webSettings.includes("featureKey: FEATURE_KEYS.SMS") &&
    mobileSettings.includes("FEATURE_KEYS.SMS"),
  "6 settings use the SMS enabled feature",
);
assert(
  !churchSettings.includes("monthly_segment_limit") &&
    !webSettings.includes("SMS messaging is not included") &&
    !mobileSettings.includes("monthly_segment_limit"),
  "6 zero included credits are not the settings gate",
);
assert(
  !(steward[FEATURE_KEYS.SMS] === true && servant[FEATURE_KEYS.SMS] !== true),
  "7 9 steward to servant does not lose Text/SMS",
);

const allowance = smsIncludedAllowanceChangeDetail(250, 0);
assert(allowance.includes("250") && allowance.includes("0"), "10 allowance");
assert(
  allowance.includes("Purchased SMS credits remain available"),
  "11 purchased credits remain",
);
assert(!allowance.toLowerCase().includes("blocked"), "11 not blocked");
assert(!allowance.toLowerCase().includes("unsupported"), "7 not unsupported");

const purchasedOnly = createSmsCapacityBooks({
  includedLimit: 0,
  purchasedBalance: 50,
});
const purchasedSend = reserveApplicationSms(purchasedOnly, "servant-send", 1);
assert(
  purchasedSend.ok &&
    purchasedSend.includedSegments === 0 &&
    purchasedSend.purchasedSegments === 1,
  "8 purchased-only reserve",
);

function books() {
  const next = createSmsCapacityBooks({
    includedLimit: 0,
    purchasedBalance: 50,
  });
  assert(reserveApplicationSms(next, "delivery", 1).ok, "reserve");
  return next;
}

function accept(status: string, messageId: string) {
  const patch = providerAcceptancePatch(status, messageId, NOW);
  assert(patch.provider_message_id === messageId, "17 message id stored");
  assert(!("delivered_at" in patch), "acceptance does not clear delivery");
  return patch;
}

const accepted = accept("processing", "bird_1");
assert(accepted.status === "queued", "acceptance stays retryable");

function settle(
  ledger: ReturnType<typeof books>,
  status: string,
  mode: "ok" | "duplicate" | "throw" | "missing" | "conflict",
) {
  const sends = { count: 0 };
  const acceptance = accept(status, "bird_1");
  const current = String(acceptance.status ?? status);
  const providerMessageId = String(acceptance.provider_message_id);
  let commitCalls = 0;
  const commit = () => {
    commitCalls += 1;
    if (mode === "throw") throw new Error("database unavailable");
    if (mode === "missing") return result("missing", false);
    if (mode === "conflict") return result("conflict", false);
    const row = commitApplicationSms(ledger, "delivery");
    return row;
  };
  try {
    const committed = commit();
    if (!smsCommitSucceeded(committed)) {
      const patch = reconciliationPatch(current, NOW);
      assert(!("provider_message_id" in patch), "17 id not cleared");
      assert(patch.last_error_code === SMS_COMMIT_RECONCILIATION_CODE, "19 code");
      assert(ledger.purchasedReserved === 1, "18 still reserved");
      assert(ledger.purchasedBalance === 50, "18 balance held");
      return { outcome: "reconciliation" as const, sends, commitCalls, status: String(patch.status ?? current), providerMessageId };
    }
  } catch {
    const patch = reconciliationPatch(current, NOW);
    assert(ledger.purchasedReserved === 1 && ledger.purchasedBalance === 50, "18 throw holds");
    assert(patch.last_error_code === SMS_COMMIT_RECONCILIATION_CODE, "19 throw code");
    assert(sends.count === 0, "20 throw does not send");
    return { outcome: "reconciliation" as const, sends, commitCalls, status: String(patch.status ?? current), providerMessageId };
  }
  const consumed = ledger.ledger.filter((row) => row.reason === "consume");
  assert(consumed.length === 1 && consumed[0]?.delta === -1, "23 one consume");
  const patch = finalizeAcceptedDeliveryPatch(current, NOW);
  assert(sends.count === 0, "20 commit does not send");
  return {
    outcome: "final" as const,
    sends,
    commitCalls,
    status: String(patch.status ?? current),
    providerMessageId,
  };
}

const success = settle(books(), "processing", "ok");
assert(success.outcome === "final" && success.status === "sent", "12 24 success finalizes sent");
assert(success.commitCalls === 1, "12 one commit");

const duplicateBooks = books();
assert(commitApplicationSms(duplicateBooks, "delivery").ok, "first commit");
const duplicate = commitApplicationSms(duplicateBooks, "delivery");
assert(smsCommitSucceeded(duplicate) && duplicate.duplicate, "13 duplicate success");
assert(
  duplicateBooks.ledger.filter((row) => row.reason === "consume").length === 1,
  "22 23 second commit does not consume again",
);
assert(duplicateBooks.purchasedBalance === 49, "22 balance once");

const thrown = settle(books(), "processing", "throw");
assert(thrown.outcome === "reconciliation" && thrown.status === "queued", "14 19 39 queued");
assert(thrown.providerMessageId === "bird_1", "17 id remains");
assert(thrown.sends.count === 0, "20 no send on throw");

const missing = settle(books(), "processing", "missing");
assert(missing.outcome === "reconciliation", "15 missing reconciles");
assert(missing.sends.count === 0, "20 no send on missing");

const conflict = settle(books(), "queued", "conflict");
assert(conflict.outcome === "reconciliation", "16 conflict reconciles");
assert(conflict.providerMessageId === "bird_1", "17 conflict keeps id");

const retryBooks = books();
const retryAcceptance = accept("processing", "bird_retry");
assert(retryAcceptance.provider_message_id === "bird_retry", "retry keeps id");
const retrySends = 0;
const first = commitApplicationSms(retryBooks, "delivery");
assert(smsCommitSucceeded(first), "21 retry commit");
const second = commitApplicationSms(retryBooks, "delivery");
assert(smsCommitSucceeded(second) && second.duplicate, "22 retry idempotent");
assert(retrySends === 0, "20 retry provider.send count is 0");
const retryFinal = finalizeAcceptedDeliveryPatch("queued", NOW);
assert(retryFinal.status === "sent", "24 reconciliation finalizes");

const delivered = finalizeAcceptedDeliveryPatch("delivered", NOW);
assert(delivered.status === undefined, "25 delivered is not regressed to sent");
assert(providerAcceptancePatch("delivered", "bird_fast", NOW).status === undefined, "25 acceptance does not regress delivered");

const afterCommit = createSmsCapacityBooks({ includedLimit: 1, purchasedBalance: 0 });
reserveApplicationSms(afterCommit, "later-fail", 1);
commitApplicationSms(afterCommit, "later-fail");
const releaseAfter = releaseApplicationSms(afterCommit, "later-fail");
assert(releaseAfter.outcome === "committed" && afterCommit.includedUsed === 1, "26 failure does not release");

const webhook = readRepo("lib/sms/process-bird-webhook.ts");
assert(!webhook.includes("commit_application_sms_segments"), "27 webhook does not commit");
assert(!webhook.includes("release_application_sms_segments"), "26 27 webhook does not release");
assert(!webhook.includes("reserve_application_sms_segments"), "27 webhook does not reserve");
assert(webhook.includes("mayAdvanceDeliveryStatus"), "25 webhook uses shared precedence");

assert(birdOutcomeRecovery(null, true) === "strand", "28 29 unknown outcome strands");
assert(birdOutcomeRecovery("bird_1", true) === "commit-only", "commit-only when id exists");
const stranded = unknownAcceptancePatch(NOW);
assert(stranded.status === "failed", "28 unknown outcome is not requeued for send");
assert(!("provider_message_id" in stranded), "28 no invented provider id");

const rejected = books();
const released = releaseApplicationSms(rejected, "delivery");
assert(released.outcome === "released", "30 explicit rejection releases");
assert(rejected.purchasedReserved === 0 && rejected.purchasedBalance === 50, "30 balance restored");

const dispatch = readRepo("lib/notifications/dispatch-notification.ts");
assert(dispatch.includes("loadAcceptedSmsAwaitingCommit"), "40 cron includes accepted holds");
assert(dispatch.includes('eq("state", "reserved")'), "40 reserved allocations only");
assert(
  dispatch.includes('.not("provider_message_id", "is", null)'),
  "40 null provider id is not auto-recovered",
);
assert(
  dispatch.includes('.select("organization_id, delivery_id")') &&
    dispatch.includes("pairs.has(`${row.organization_id}:${row.id}`)"),
  "40 allocation organization and delivery must both match",
);
assert(dispatch.includes('.eq("channel", "sms")'), "40 reconciliation is SMS only");
assert(dispatch.includes("commitAcceptedSms"), "41 commit-only helper");
assert(
  dispatch.includes("scheduleAutomaticSmsReplenishmentAfterCommit"),
  "41 post-commit replenishment trigger scheduled only after commit",
);
const commitHelper = dispatch.slice(dispatch.indexOf("async function commitAcceptedSms"));
assert(
  commitHelper.indexOf("commitApplicationSmsSegments") <
    commitHelper.indexOf("scheduleAutomaticSmsReplenishmentAfterCommit"),
  "41 trigger follows successful commit",
);
const sendFn = dispatch.slice(dispatch.indexOf("export async function sendSmsDelivery"));
assert(sendFn.indexOf("unknownAcceptancePatch") < sendFn.indexOf("await provider.send") === false || sendFn.includes("unknownAcceptancePatch"), "28 unknown patch used");
assert(sendFn.includes("await releaseApplicationSmsSegments"), "30 rejection still releases");
assert(sendFn.indexOf("await releaseApplicationSmsSegments") > sendFn.indexOf("if (!sendResult.ok)") || sendFn.includes("if (provider.name === \"bird\")"), "30 release stays on provider failure");
assert(
  !sendFn
    .slice(sendFn.indexOf("if (!sendResult.ok)"), sendFn.indexOf("const permanent"))
    .includes("scheduleAutomaticSmsReplenishmentAfterCommit"),
  "30 Bird failure does not schedule replenishment",
);

const migration = readRepo("supabase/migrations/109_servant_application_sms_enabled.sql");
assert(migration.includes("boolean_value = true"), "migration enables sms");
assert(migration.includes("v_enabled_rows <> 1"), "migration fails closed on ambiguous rows");
assert(!migration.includes("steward_pro"), "migration does not mention steward");
assert(!migration.includes("shepherd_plus") && !migration.includes("omni_enterprise"), "other plans untouched");

console.log("sms acceptance settlement selfcheck passed");
