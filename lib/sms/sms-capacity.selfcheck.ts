/**
 * Application SMS capacity self-check.
 * No Stripe, Bird, Supabase, or email network calls.
 * Run: npx --yes tsx lib/sms/sms-capacity.selfcheck.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { evaluateSmsEligibility } from "@/lib/sms/eligibility";
import { ACCESS_GRANTING_STATUSES } from "@/lib/subscriptions/status";
import {
  commitApplicationSms,
  createSmsCapacityBooks,
  includedRemaining,
  markApplicationSmsSendStarted,
  purchasedAvailable,
  releaseApplicationSms,
  reserveApplicationSms,
  withSmsCapacityLock,
  type SmsCapacityBooks,
} from "@/lib/sms/sms-capacity";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function readRepo(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function snapshot(books: SmsCapacityBooks) {
  return {
    used: books.includedUsed,
    reserved: books.includedReserved,
    balance: books.purchasedBalance,
    purchasedReserved: books.purchasedReserved,
    events: books.usageEvents.length,
    ledger: books.ledger.length,
  };
}

const ORG = "org-sms";

async function main() {
  const steward = createSmsCapacityBooks({
    includedLimit: 250,
    purchasedBalance: null,
  });
  const one = reserveApplicationSms(steward, "d1", 1);
  assert(one.ok && one.includedSegments === 1 && one.purchasedSegments === 0, "1");
  assert(steward.includedReserved === 1 && steward.includedUsed === 0, "1 hold");

  const almost = createSmsCapacityBooks({
    includedLimit: 250,
    includedUsed: 249,
    purchasedBalance: null,
  });
  const lastIncluded = reserveApplicationSms(almost, "d2", 1);
  assert(
    lastIncluded.includedSegments === 1 && lastIncluded.purchasedSegments === 0,
    "2",
  );

  const over = createSmsCapacityBooks({
    includedLimit: 250,
    includedUsed: 250,
    purchasedBalance: 100,
  });
  const bought = reserveApplicationSms(over, "d3", 1);
  assert(bought.includedSegments === 0 && bought.purchasedSegments === 1, "3");
  assert(over.purchasedBalance === 100 && over.purchasedReserved === 1, "3 balance");

  const splitBooks = createSmsCapacityBooks({
    includedLimit: 250,
    includedUsed: 249,
    purchasedBalance: 100,
  });
  const split = reserveApplicationSms(splitBooks, "d4", 3);
  assert(split.includedSegments === 1 && split.purchasedSegments === 2, "4");
  assert(split.includedSegments + split.purchasedSegments === 3, "19");

  const servant = createSmsCapacityBooks({
    includedLimit: 0,
    purchasedBalance: 50,
  });
  const servantSend = reserveApplicationSms(servant, "d5", 1);
  assert(
    servantSend.ok &&
      servantSend.includedSegments === 0 &&
      servantSend.purchasedSegments === 1,
    "5",
  );

  const servantEmpty = createSmsCapacityBooks({
    includedLimit: 0,
    purchasedBalance: 0,
  });
  const beforeEmpty = snapshot(servantEmpty);
  const blocked = reserveApplicationSms(servantEmpty, "d6", 1);
  assert(!blocked.ok && blocked.outcome === "insufficient", "6");
  assert(JSON.stringify(snapshot(servantEmpty)) === JSON.stringify(beforeEmpty), "6 unchanged");

  const short = createSmsCapacityBooks({
    includedLimit: 0,
    purchasedBalance: 2,
  });
  const beforeShort = snapshot(short);
  const partial = reserveApplicationSms(short, "d7", 3);
  assert(!partial.ok && partial.outcome === "insufficient", "7");
  assert(short.allocations.size === 0, "7 no partial row");
  assert(JSON.stringify(snapshot(short)) === JSON.stringify(beforeShort), "7 unchanged");

  const consent = evaluateSmsEligibility({
    organizationId: ORG,
    userId: "user",
    phoneNumber: "+14155552671",
    organizationSmsEnabled: true,
    consentStatus: "unknown",
    endpointStatus: "active",
    isVerified: true,
    suppressed: false,
  });
  assert(!consent.allowed && consent.reason === "SMS_NOT_OPTED_IN", "8");

  const stopped = evaluateSmsEligibility({
    organizationId: ORG,
    userId: "user",
    phoneNumber: "+14155552671",
    organizationSmsEnabled: true,
    consentStatus: "granted",
    endpointStatus: "revoked",
    isVerified: true,
    suppressed: true,
  });
  assert(!stopped.allowed && stopped.reason === "SMS_SUPPRESSED", "9");

  const rejectBooks = createSmsCapacityBooks({
    includedLimit: 250,
    includedUsed: 10,
    purchasedBalance: 20,
  });
  const held = reserveApplicationSms(rejectBooks, "d10", 2);
  assert(held.includedSegments === 2, "10 reserved");
  const released = releaseApplicationSms(rejectBooks, "d10");
  assert(released.outcome === "released", "10");
  assert(rejectBooks.includedUsed === 10, "10 used unchanged");
  assert(rejectBooks.includedReserved === 0, "10 included released");
  assert(rejectBooks.purchasedBalance === 20 && rejectBooks.purchasedReserved === 0, "10 balance");
  assert(
    !rejectBooks.ledger.some((entry) => entry.reason === "consume"),
    "10 no consume",
  );

  const accept = createSmsCapacityBooks({
    includedLimit: 250,
    purchasedBalance: 5,
  });
  reserveApplicationSms(accept, "d11", 1);
  const committed = commitApplicationSms(accept, "d11");
  assert(committed.outcome === "committed" && !committed.duplicate, "11");
  assert(accept.includedUsed === 1 && accept.includedReserved === 0, "11 consumed");
  const consumeEvent = accept.usageEvents.find(
    (event) => event.eventType === "consume",
  );
  assert(consumeEvent?.quantity === 1, "30");
  assert(consumeEvent?.usageKey === "sms:consume:delivery:d11", "30 key");

  const again = commitApplicationSms(accept, "d11");
  assert(again.duplicate && accept.includedUsed === 1, "12");
  assert(
    accept.ledger.filter((entry) => entry.reason === "consume").length === 0,
    "12 no purchased consume",
  );

  const dup = createSmsCapacityBooks({ includedLimit: 250 });
  reserveApplicationSms(dup, "d13", 1);
  const second = reserveApplicationSms(dup, "d13", 1);
  assert(second.duplicate && dup.includedReserved === 1, "13");

  const rel = createSmsCapacityBooks({ includedLimit: 250 });
  reserveApplicationSms(rel, "d14", 1);
  releaseApplicationSms(rel, "d14");
  const secondRelease = releaseApplicationSms(rel, "d14");
  assert(secondRelease.duplicate && rel.includedReserved === 0, "14");

  const webhook = readRepo("lib/sms/process-bird-webhook.ts");
  assert(!webhook.includes("reserve_application_sms_segments"), "15");
  assert(!webhook.includes("commit_application_sms_segments"), "15 commit");
  assert(!webhook.includes("release_application_sms_segments"), "16");
  assert(!webhook.includes("recordSmsSegmentsConsumed"), "16 usage");

  const finalSegment = createSmsCapacityBooks({
    includedLimit: 1,
    purchasedBalance: null,
  });
  const racedIncluded = await Promise.all([
    withSmsCapacityLock(ORG, () => reserveApplicationSms(finalSegment, "a", 1)),
    withSmsCapacityLock(ORG, () => reserveApplicationSms(finalSegment, "b", 1)),
  ]);
  const includedWins = racedIncluded.filter((row) => row.ok);
  assert(includedWins.length === 1, "17");
  assert(finalSegment.includedReserved === 1, "17 reserved once");

  const finalCredit = createSmsCapacityBooks({
    includedLimit: 0,
    purchasedBalance: 1,
  });
  const racedCredit = await Promise.all([
    withSmsCapacityLock("org-credit", () =>
      reserveApplicationSms(finalCredit, "c", 1),
    ),
    withSmsCapacityLock("org-credit", () =>
      reserveApplicationSms(finalCredit, "d", 1),
    ),
  ]);
  assert(racedCredit.filter((row) => row.ok).length === 1, "18");
  assert(finalCredit.purchasedReserved === 1, "18 reserved once");

  const rollover = createSmsCapacityBooks({
    includedLimit: 250,
    includedUsed: 40,
    purchasedBalance: 15,
    periodStart: "2026-10-08T00:00:00.000Z",
    periodEnd: "2026-11-08T00:00:00.000Z",
  });
  rollover.includedUsed = 0;
  rollover.includedReserved = 0;
  rollover.periodStart = "2026-11-08T00:00:00.000Z";
  rollover.periodEnd = "2026-12-08T00:00:00.000Z";
  assert(includedRemaining(rollover) === 250, "20 allowance");
  assert(rollover.purchasedBalance === 15, "20 balance");

  const upgraded = createSmsCapacityBooks({
    includedLimit: 250,
    purchasedBalance: 80,
  });
  upgraded.includedLimit = 500;
  assert(upgraded.purchasedBalance === 80, "21");
  upgraded.includedLimit = 250;
  assert(upgraded.purchasedBalance === 80, "22");

  const pending = createSmsCapacityBooks({
    access: "eligible",
    includedLimit: 250,
    purchasedBalance: 3,
  });
  assert(reserveApplicationSms(pending, "pending", 1).ok, "23");

  const cancelled = createSmsCapacityBooks({
    access: "cancelled",
    includedLimit: 250,
    purchasedBalance: 40,
  });
  const cancelledSend = reserveApplicationSms(cancelled, "cancelled", 1);
  assert(!cancelledSend.ok && cancelledSend.outcome === "ineligible", "24");
  assert(cancelled.purchasedBalance === 40 && cancelled.purchasedReserved === 0, "24 retained");

  cancelled.access = "eligible";
  cancelled.includedLimit = 250;
  cancelled.includedUsed = 0;
  const resumed = reserveApplicationSms(cancelled, "resumed", 1);
  assert(resumed.ok && resumed.purchasedSegments === 0, "25 included first");
  assert(cancelled.purchasedBalance === 40, "25 retained");

  const retry = createSmsCapacityBooks({ includedLimit: 250, purchasedBalance: 4 });
  reserveApplicationSms(retry, "same", 2);
  commitApplicationSms(retry, "same");
  const retryCommit = commitApplicationSms(retry, "same");
  assert(retryCommit.duplicate && retry.includedUsed === 2, "26");
  assert(retry.purchasedBalance === 4, "26 balance");
  const afterCrash = commitApplicationSms(retry, "same");
  assert(afterCrash.duplicate && retry.includedUsed === 2, "27");

  const mfa = readRepo("lib/mfa/send-sms.ts");
  assert(!mfa.includes("reserveApplicationSmsSegments"), "28 reserve");
  assert(!mfa.includes("commitApplicationSmsSegments"), "28 commit");
  assert(!mfa.includes("recordSmsSegmentsConsumed"), "28 usage");
  assert(!mfa.includes("organization_sms_credit"), "28 ledger");

  const noRow = createSmsCapacityBooks({
    includedLimit: 10,
    purchasedBalance: null,
  });
  assert(purchasedAvailable(noRow) === 0, "29");
  const noRowReserve = reserveApplicationSms(noRow, "norow", 1);
  assert(noRowReserve.purchasedSegments === 0 && noRow.purchasedBalance === null, "29 no row");

  const sensitive = createSmsCapacityBooks({
    includedLimit: 0,
    purchasedBalance: 5,
  });
  reserveApplicationSms(sensitive, "meta", 1);
  commitApplicationSms(sensitive, "meta");
  const entry = sensitive.ledger.find((row) => row.reason === "consume");
  assert(entry?.delta === -1, "31 delta");
  const encoded = JSON.stringify(entry?.metadata ?? {});
  assert(!encoded.includes("body") && !encoded.includes("phone"), "31 32");
  assert(!encoded.includes("+1"), "32");

  const self = readRepo("lib/sms/sms-capacity.selfcheck.ts");
  const selfImports = self.slice(0, self.indexOf("function assert"));
  assert(!selfImports.includes("stripe") && !selfImports.includes("messagebird"), "33");
  assert(!selfImports.includes("resend") && !selfImports.includes("supabase"), "33 network");

  const sql = readRepo("supabase/migrations/106_application_sms_capacity.sql");
  assert(
    sql.includes(
      `status IN (${ACCESS_GRANTING_STATUSES.map((status) => `'${status}'`).join(", ")})`,
    ),
    "SMS reserve uses the centralized access-granting statuses",
  );
  assert(!sql.includes("'incomplete'"), "incomplete is not SMS eligible");
  assert(
    sql.includes("organization_sms_segment_allocations_send_started_idx"),
    "unresolved send index",
  );
  assert(sql.includes("pg_advisory_xact_lock"), "lock");
  assert(sql.includes("FOR UPDATE"), "row lock");
  assert(!sql.includes("period_reset"), "no period reset");
  assert(sql.includes("balance - reserved"), "available purchased");
  assert(sql.includes("'consume'"), "consume reason");

  const dispatch = readRepo("lib/notifications/dispatch-notification.ts");
  const sendFn = dispatch.slice(dispatch.indexOf("export async function sendSmsDelivery"));
  const reserveAt = sendFn.indexOf("await reserveApplicationSmsSegments");
  const sendAt = sendFn.indexOf("await provider.send");
  const commitAt = sendFn.lastIndexOf("await commitApplicationSmsSegments");
  assert(reserveAt > 0 && reserveAt < sendAt && commitAt > sendAt, "order");
  assert(sendFn.indexOf("await canSendSms") < reserveAt, "consent before reserve");

  const beforeBird = createSmsCapacityBooks({ includedLimit: 250 });
  reserveApplicationSms(beforeBird, "crash-a", 1);
  const replay = reserveApplicationSms(beforeBird, "crash-a", 1);
  assert(replay.duplicate && beforeBird.includedReserved === 1, "crash before bird");

  const started = createSmsCapacityBooks({ includedLimit: 250 });
  reserveApplicationSms(started, "crash-b", 1);
  const marked = markApplicationSmsSendStarted(started, "crash-b");
  assert(marked.sendAllowed === true, "mark");
  const stranded = markApplicationSmsSendStarted(started, "crash-b");
  assert(stranded.outcome === "stranded" && stranded.sendAllowed === false, "stranded");
  assert(started.includedReserved === 1, "stranded still held");

  const none = createSmsCapacityBooks({ access: "none", includedLimit: 250, purchasedBalance: 9 });
  assert(reserveApplicationSms(none, "none", 1).outcome === "ineligible", "no subscription");
  assert(none.purchasedBalance === 9, "no subscription retains balance");

  console.log("sms capacity selfcheck passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
