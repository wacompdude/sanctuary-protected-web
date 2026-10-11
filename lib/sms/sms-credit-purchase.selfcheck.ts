/**
 * Purchased application SMS credit grant self-check.
 * No Stripe, Bird, Supabase, or email network calls.
 * Run: npx --yes tsx lib/sms/sms-credit-purchase.selfcheck.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { COMMERCIAL_PLAN_CATALOG } from "@/lib/billing/commercial-catalog";
import { PLAN_KEYS } from "@/lib/subscriptions/plan-keys";
import {
  assertPurchaseCreditInput,
  creditPurchasedSmsInMemory,
  parseSmsPurchaseCreditResult,
  SmsPurchaseCreditInputError,
  type SmsPurchaseCreditBooks,
} from "@/lib/sms/sms-credit-purchase";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function readRepo(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function emptyBooks(): SmsPurchaseCreditBooks {
  return {
    balance: null,
    reserved: 0,
    autoReplenishEnabled: null,
    lowBalanceThreshold: null,
    ledger: [],
  };
}

function rejects(segments: number, key: string): boolean {
  try {
    assertPurchaseCreditInput({
      organizationId: "11111111-1111-4111-8111-111111111111",
      segments,
      idempotencyKey: key,
    });
    return false;
  } catch (error) {
    return error instanceof SmsPurchaseCreditInputError;
  }
}

function main() {
  assert(
    assertPurchaseCreditInput({
      organizationId: "11111111-1111-4111-8111-111111111111",
      segments: 100,
      idempotencyKey: " sms:purchase:cs_test ",
    }).idempotencyKey === "sms:purchase:cs_test",
    "1 positive segment count accepted",
  );
  assert(rejects(0, "purchase-zero"), "2 zero segments rejected");
  assert(rejects(-5, "purchase-negative"), "3 negative segments rejected");
  assert(rejects(100, "   "), "4 blank idempotency key rejected");

  const created = emptyBooks();
  const first = creditPurchasedSmsInMemory(created, {
    segments: 100,
    idempotencyKey: "purchase_123",
    metadata: { package_key: "sms_block_100" },
  });
  assert(
    first.ok &&
      !first.duplicate &&
      first.outcome === "credited" &&
      first.creditedSegments === 100,
    "5 new purchase credits the requested segments",
  );
  assert(created.balance === 100 && created.reserved === 0, "8 balance increases, reserved unchanged");
  assert(created.ledger.length === 1, "8 one ledger row");
  assert(created.ledger[0]?.reason === "manual_purchase", "11 ledger reason");
  assert(created.ledger[0]?.delta === 100, "12 ledger delta");
  assert(created.autoReplenishEnabled === true, "9 no-row balance is initialized");
  assert(created.lowBalanceThreshold === 25, "9 default threshold is left to initialization");

  const replay = creditPurchasedSmsInMemory(created, {
    segments: 100,
    idempotencyKey: "purchase_123",
  });
  assert(
    replay.ok &&
      replay.duplicate &&
      replay.outcome === "duplicate" &&
      replay.creditedSegments === 100 &&
      created.balance === 100 &&
      created.ledger.length === 1,
    "6 duplicate purchase does not credit again",
  );

  const mismatch = creditPurchasedSmsInMemory(created, {
    segments: 500,
    idempotencyKey: "purchase_123",
  });
  assert(
    !mismatch.ok &&
      mismatch.duplicate &&
      mismatch.outcome === "idempotency_mismatch" &&
      mismatch.creditedSegments === 100 &&
      created.balance === 100 &&
      created.ledger.length === 1,
    "7 different segment count for the same key is rejected",
  );

  const existing = emptyBooks();
  existing.balance = 40;
  existing.reserved = 5;
  existing.autoReplenishEnabled = false;
  existing.lowBalanceThreshold = 10;
  const added = creditPurchasedSmsInMemory(existing, {
    segments: 50,
    idempotencyKey: "purchase_existing",
  });
  assert(
    added.balance === 90 &&
      added.reserved === 5 &&
      added.available === 85 &&
      existing.autoReplenishEnabled === false &&
      existing.lowBalanceThreshold === 10,
    "10 existing configuration is preserved and reserved is unchanged",
  );

  const parsed = parseSmsPurchaseCreditResult({
    ok: true,
    outcome: "credited",
    duplicate: false,
    balance: 100,
    reserved: 0,
    available: 100,
    credited_segments: 100,
  });
  assert(parsed.creditedSegments === 100 && parsed.available === 100, "typed result");

  const sql = readRepo("supabase/migrations/107_credit_purchased_application_sms.sql");
  const smsA = readRepo("supabase/migrations/106_application_sms_capacity.sql");
  assert(
    sql.includes("application_sms_capacity_lock(p_organization_id)"),
    "purchase uses the SMS-A organization lock",
  );
  assert(sql.includes("SECURITY DEFINER"), "13 security definer");
  assert(sql.includes("SET search_path = public"), "search_path");
  assert(
    sql.includes(
      "REVOKE ALL ON FUNCTION public.credit_purchased_application_sms_segments(uuid, integer, text, jsonb) FROM PUBLIC",
    ),
    "13 public execute revoked",
  );
  assert(sql.includes("FROM anon"), "13 anon execute revoked");
  assert(sql.includes("FROM authenticated"), "13 authenticated execute revoked");
  assert(
    sql.includes(
      "GRANT EXECUTE ON FUNCTION public.credit_purchased_application_sms_segments(uuid, integer, text, jsonb) TO service_role",
    ),
    "14 service_role execute granted",
  );
  assert(!sql.includes("TO authenticated") && !sql.includes("TO anon"), "13 no browser grant");
  assert(sql.includes("'manual_purchase'"), "11 SQL ledger reason");
  assert(!sql.includes("CREATE OR REPLACE FUNCTION public.reserve_application_sms_segments"), "15 reserve untouched");
  assert(!sql.includes("CREATE OR REPLACE FUNCTION public.commit_application_sms_segments"), "15 commit untouched");
  assert(!sql.includes("CREATE OR REPLACE FUNCTION public.release_application_sms_segments"), "15 release untouched");
  assert(!sql.includes("CREATE OR REPLACE FUNCTION public.mark_application_sms_send_started"), "15 send-started untouched");
  assert(!smsA.includes("credit_purchased_application_sms_segments"), "15 migration 106 untouched by name");
  assert(!sql.includes("auto_replenish_enabled ="), "17 auto-replenish is not updated");
  assert(!sql.includes("'refund'"), "18 refund behavior is not introduced");
  assert(!sql.includes("related_transaction_id"), "no billing transaction is created");
  assert(sql.includes("balance = balance + p_segments"), "balance increases");
  assert(!sql.includes("reserved = reserved +"), "reserved is not increased");

  const servant = COMMERCIAL_PLAN_CATALOG.find(
    (plan) => plan.planKey === PLAN_KEYS.SERVANT_STANDARD,
  );
  assert(servant?.monthlySmsSegmentLimit === 0, "16 Servant included SMS remains 0");
  assert((servant?.smsPackageCredits ?? 0) > 0, "16 Servant can purchase SMS credits");
  assert(!sql.includes("servant"), "16 the credit RPC does not block a plan");

  const dispatch = readRepo("lib/notifications/dispatch-notification.ts");
  assert(
    !dispatch.includes("credit_purchased_application_sms_segments"),
    "15 dispatch does not grant purchased credits",
  );

  const wrapper = readRepo("lib/sms/sms-credit-purchase.ts");
  const wrapperImports = wrapper.slice(0, wrapper.indexOf("export const SMS_PURCHASE_MAX_SEGMENTS"));
  assert(!wrapperImports.includes("stripe"), "wrapper does not call Stripe");
  assert(!wrapper.includes("bird"), "wrapper does not call Bird");

  console.log("sms-credit-purchase.selfcheck: ok");
}

main();
