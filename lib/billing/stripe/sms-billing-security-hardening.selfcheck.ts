/**
 * Static checks for Phase 3Z SMS billing security hardening (migration 115 + UI).
 * No Stripe, Bird, Supabase, or financial writes.
 * Run: npx tsx lib/billing/stripe/sms-billing-security-hardening.selfcheck.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  SMS_PAYMENT_SETUP_CUSTOMER_ERRORS,
  customerSafeSmsPaymentSetupError,
} from "@/lib/billing/stripe/sms-payment-setup";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function readRepo(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const migration = readRepo(
  "supabase/migrations/115_sms_billing_security_hardening.sql",
);
const panel = readRepo("components/billing/sms-auto-replenishment-panel.tsx");
const setupPanel = readRepo("components/billing/sms-payment-setup-panel.tsx");
const actions = readRepo(
  "app/(app)/settings/billing/sms-auto-replenishment-actions.ts",
);
const adminAdj = readRepo("lib/sms/sms-credit-admin-adjustment.ts");
const platformSms = readRepo("app/platform/(console)/sms/actions.ts");

// F-3Y-04 RLS
assert(
  migration.includes("organization_sms_credit_balances_select"),
  "1 balance policy replaced",
);
assert(
  migration.includes("can_view_organization_billing(organization_id)"),
  "2 balance SELECT uses billing-view",
);
assert(
  !migration.includes("has_active_organization_membership(organization_id)"),
  "3 membership-wide SELECT removed from balances",
);
assert(
  migration.includes("REVOKE INSERT, UPDATE, DELETE ON public.organization_sms_credit_balances"),
  "4 financial writes remain revoked",
);

// F-3Y-05 tax attention actor
assert(
  migration.includes("DROP FUNCTION IF EXISTS public.resolve_application_sms_replenishment_tax_attention(uuid)"),
  "5 old single-arg resolve dropped",
);
assert(
  migration.includes("p_actor_user_id uuid"),
  "6 resolve requires actor",
);
assert(
  migration.includes("v_role NOT IN ('owner', 'co_owner')"),
  "7 owner/co_owner gate",
);
assert(
  migration.includes("GRANT EXECUTE ON FUNCTION public.resolve_application_sms_replenishment_tax_attention(uuid, uuid) TO service_role"),
  "8 service_role only",
);
assert(
  migration.includes("FROM anon") && migration.includes("FROM authenticated"),
  "9 anon/authenticated revoked",
);
assert(
  migration.includes("SET search_path = public"),
  "10 search_path fixed",
);
assert(
  !migration.includes("paymentIntents") &&
    !migration.includes("organization_sms_credit_ledger") &&
    !migration.includes("billing_transactions"),
  "11 no charge/grant/ledger side effects in migration body beyond event",
);
assert(
  actions.includes("p_actor_user_id: user.id"),
  "12 server action passes trusted actor",
);
assert(
  actions.includes("requireBillingManageAccess"),
  "13 manage access required",
);
assert(
  !actions.includes("formData.get(\"organization") &&
    !actions.includes("formData.get('organization"),
  "14 no browser organization spoof",
);
assert(
  !actions.includes("formData.get(\"actor") &&
    !actions.includes("formData.get('actor"),
  "15 no browser actor spoof",
);

// Admin adjustment isolation reaffirm
assert(
  migration.includes("adjust_application_sms_purchased_credits"),
  "16 migration reaffirms admin adjust grants",
);
assert(
  adminAdj.includes("service-role") || adminAdj.includes("service_role"),
  "17 admin adjust wrapper remains service-role",
);
assert(
  !platformSms.includes("adjust_application_sms_purchased_credits"),
  "18 platform SMS has no adjust caller",
);

// F-3Y-02 copy
assert(
  panel.includes("Automatic SMS credit purchases are enabled"),
  "19 enabled current-state copy",
);
assert(
  panel.includes("If you disable automatic") &&
    panel.includes("automatic SMS credit purchases will stop"),
  "20 conditional disable copy",
);
assert(
  !panel.includes("Automatic purchases stop. The saved card remains"),
  "21 old misleading copy removed",
);

// F-3Y-03 sanitization
assert(
  setupPanel.includes("customerSafeSmsPaymentSetupError"),
  "22 panel uses safe mapper",
);
assert(
  !setupPanel.includes("result.error.message ??"),
  "23 raw Stripe message not shown",
);
assert(
  customerSafeSmsPaymentSetupError({ code: "authentication_required" }) ===
    SMS_PAYMENT_SETUP_CUSTOMER_ERRORS.authentication_required,
  "24 auth required maps safely",
);
assert(
  customerSafeSmsPaymentSetupError({
    message: "Your card was declined. raw secret sk_test_xxx",
    code: "card_declined",
  }) === SMS_PAYMENT_SETUP_CUSTOMER_ERRORS.verify_and_retry,
  "25 card decline maps without raw text",
);
assert(
  customerSafeSmsPaymentSetupError({
    message: "Unexpected Stripe dump pi_123 cus_456",
  }) === SMS_PAYMENT_SETUP_CUSTOMER_ERRORS.generic,
  "26 unknown errors use generic copy",
);
assert(
  !customerSafeSmsPaymentSetupError({
    message: "sk_test_leak",
  }).includes("sk_test"),
  "27 mapper never echoes secrets",
);

// F-3Y-08 preserved: threshold/cap form only on enable path, not while enabled
const enabledBlock = panel.slice(panel.indexOf('current === "enabled"'));
assert(
  enabledBlock.includes("Turn off automatic replenishment") &&
    !enabledBlock.includes('name="threshold"') &&
    !enabledBlock.includes('name="spending_cap_cents"'),
  "28 threshold/cap not editable while enabled",
);

console.log("sms billing security hardening selfcheck passed");
