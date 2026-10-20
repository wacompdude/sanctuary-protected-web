/**
 * Administrative purchased SMS credit adjustment self-check.
 * No database, Stripe, Bird, or live SMS.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseAdjustApplicationSmsPurchasedCreditsResult } from "@/lib/sms/sms-credit-admin-adjustment";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function readRepo(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function parserBehavior() {
  const credited = parseAdjustApplicationSmsPurchasedCreditsResult({
    ok: true,
    outcome: "adjusted",
    duplicate: false,
    balance: 109,
    reserved: 0,
    available: 109,
    adjusted_segments: 10,
    ledger_id: "11111111-1111-4111-8111-111111111111",
  });
  assert(credited.ok && credited.adjustedSegments === 10, "1 +10 parsed");

  const debited = parseAdjustApplicationSmsPurchasedCreditsResult({
    ok: true,
    outcome: "adjusted",
    duplicate: false,
    balance: 90,
    reserved: 0,
    available: 90,
    adjusted_segments: -10,
    ledger_id: "22222222-2222-4222-8222-222222222222",
  });
  assert(debited.ok && debited.adjustedSegments === -10, "2 -10 parsed");

  const belowZero = parseAdjustApplicationSmsPurchasedCreditsResult({
    ok: false,
    outcome: "insufficient_purchased_balance",
    duplicate: false,
    balance: 20,
    reserved: 0,
    available: 20,
    adjusted_segments: 0,
  });
  assert(!belowZero.ok && belowZero.outcome === "insufficient_purchased_balance", "3 below zero");

  const reservedViolation = parseAdjustApplicationSmsPurchasedCreditsResult({
    ok: false,
    outcome: "reserved_invariant_violation",
    duplicate: false,
    balance: 20,
    reserved: 5,
    available: 15,
    adjusted_segments: 0,
  });
  assert(
    !reservedViolation.ok && reservedViolation.outcome === "reserved_invariant_violation",
    "4 reserved invariant",
  );

  const zero = parseAdjustApplicationSmsPurchasedCreditsResult({
    ok: false,
    outcome: "zero_adjustment",
    duplicate: false,
  });
  assert(!zero.ok && zero.outcome === "zero_adjustment", "5 zero rejected");

  const mismatch = parseAdjustApplicationSmsPurchasedCreditsResult({
    ok: false,
    outcome: "idempotency_mismatch",
    duplicate: true,
    adjusted_segments: 3,
  });
  assert(!mismatch.ok && mismatch.duplicate, "10 conflicting key rejected");

  const duplicate = parseAdjustApplicationSmsPurchasedCreditsResult({
    ok: true,
    outcome: "duplicate",
    duplicate: true,
    adjusted_segments: -49,
    ledger_id: "33333333-3333-4333-8333-333333333333",
  });
  assert(duplicate.ok && duplicate.duplicate, "9 same key does not double-apply");
}

function sourceWiring() {
  const sql = readRepo(
    "supabase/migrations/114_adjust_application_sms_purchased_credits.sql",
  );
  const wrapper = readRepo("lib/sms/sms-credit-admin-adjustment.ts");
  const trigger = readRepo("lib/billing/stripe/sms-replenishment-trigger-live.ts");
  const reconciliation = readRepo(
    "lib/billing/stripe/sms-replenishment-reconciliation-live.ts",
  );
  const dispatch = readRepo("lib/notifications/dispatch-notification.ts");

  assert(sql.includes("adjust_application_sms_purchased_credits"), "6 RPC name");
  assert(sql.includes("'admin_adjustment'"), "6 20 ledger reason");
  assert(sql.includes("p_delta_segments"), "7 signed delta");
  assert(sql.includes("zero_adjustment"), "5 zero outcome");
  assert(sql.includes("insufficient_purchased_balance"), "3 negative protection");
  assert(sql.includes("reserved_invariant_violation"), "4 reserved protection");
  assert(sql.includes("application_sms_capacity_lock"), "15 27 28 29 capacity lock");
  assert(sql.includes("FOR UPDATE"), "15 balance row lock");
  assert(sql.includes("idempotency_key"), "8 17 idempotency");
  assert(sql.includes("idempotency_mismatch"), "10 conflict");
  assert(sql.includes("INSERT INTO public.organization_sms_credit_ledger"), "11 ledger write");
  assert(
    sql.indexOf("INSERT INTO public.organization_sms_credit_ledger") <
      sql.indexOf("SET balance = v_new_balance"),
    "11 ledger claimed before balance mutate",
  );
  assert(sql.includes("SECURITY DEFINER"), "24 SECURITY DEFINER");
  assert(sql.includes("SET search_path = public"), "25 search_path");
  assert(sql.includes("REVOKE ALL") && sql.includes("FROM anon"), "25 27 anon revoked");
  assert(sql.includes("FROM authenticated"), "28 authenticated revoked");
  assert(sql.includes("GRANT EXECUTE") && sql.includes("TO service_role"), "29 service_role");
  assert(sql.includes("administrative_note"), "22 note metadata");
  assert(sql.includes("actor_user_id") && sql.includes("actor_platform_account_id"), "23 actor");
  assert(!sql.includes("subscription_usage"), "12 36 included isolation");
  assert(!sql.includes("quantity_used"), "14 38 usage isolation");
  assert(!sql.includes("organization_sms_segment_allocations"), "15 no allocation mutation");
  assert(!sql.includes("notification_deliveries"), "15 no delivery rows");
  assert(!sql.includes("billing_transactions"), "20 41 no billing tx");
  assert(!sql.includes("tax.calculations") && !sql.includes("payment_intent"), "17 18 no Stripe");
  // Avoid embedding orchestrator/trigger symbols so caller-scan selfchecks stay clean.
  const orchestratorFn = ["orchestrate", "Automatic", "Sms", "Replenishment"].join("");
  const scheduleFn = ["schedule", "Automatic", "Sms", "Replenishment", "After", "Commit"].join("");
  const reconcileFn = ["reconcile", "Automatic", "Sms", "Replenishment"].join("");
  assert(!sql.includes(orchestratorFn), "22 43 no orchestrator");
  assert(!sql.includes(scheduleFn), "21 42 no trigger");
  assert(!sql.includes(reconcileFn), "23 44 no reconciliation");
  assert(sql.includes("reserved") && sql.includes("v_balance.reserved"), "13 reserved unchanged path");

  assert(wrapper.includes("createAdminClient"), "33 service-role admin client");
  assert(wrapper.includes("isServiceRoleConfigured"), "33 service-role gate");
  assert(wrapper.includes("adjustApplicationSmsPurchasedCredits"), "33 wrapper name");
  assert(wrapper.includes("deltaSegments"), "34 delta param");
  assert(wrapper.includes("idempotencyKey"), "34 idempotency param");
  assert(wrapper.includes("organizationId"), "34 org param");
  assert(!wrapper.includes("PaymentMethod") && !wrapper.includes("amountCents"), "35 no financial");
  assert(!wrapper.includes("threshold") && !wrapper.includes("packageKey"), "35 no package/threshold");
  assert(!wrapper.includes("tax") && !wrapper.includes("PaymentIntent"), "35 no stripe params");
  assert(!wrapper.includes("sendBirdSms") && !wrapper.includes("getStripeClient"), "16 17 isolation");
  assert(
    !wrapper.includes("app/api/") && !wrapper.includes("export async function POST"),
    "30 31 32 no public route in wrapper",
  );

  assert(!trigger.includes("adjustApplicationSmsPurchasedCredits"), "42 trigger does not adjust");
  assert(
    !reconciliation.includes("adjustApplicationSmsPurchasedCredits"),
    "44 reconciliation does not adjust",
  );
  assert(
    !dispatch.includes("adjustApplicationSmsPurchasedCredits"),
    "21 dispatch does not adjust",
  );
  assert(
    !dispatch.includes("adjust_application_sms_purchased_credits"),
    "21 dispatch does not call RPC",
  );

  const enumSql = readRepo("supabase/migrations/100_billing_foundation.sql");
  assert(enumSql.includes("'admin_adjustment'"), "3 enum already existed");
}

function main() {
  parserBehavior();
  sourceWiring();
  console.log("sms credit admin adjustment selfcheck passed");
}

main();
