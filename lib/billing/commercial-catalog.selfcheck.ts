/**
 * Phase 4A commercial catalog self-check (no database / Stripe required).
 * Run: npx --yes tsx lib/billing/commercial-catalog.selfcheck.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  COMMERCIAL_PLAN_CATALOG,
  commercialPlanByKey,
  smsPackageForPlan,
} from "@/lib/billing/commercial-catalog";
import {
  BILLING_MANAGE_PERMISSIONS,
  BILLING_READ_PERMISSIONS,
  PERMISSION_KEYS,
  ROLE_PERMISSION_MAPPING,
} from "@/lib/security/permission-keys";
import { FEATURE_KEYS } from "@/lib/subscriptions/feature-keys";
import { EXPECTED_PLAN_ENTITLEMENTS } from "@/lib/subscriptions/expected-matrix";
import { PLAN_KEYS } from "@/lib/subscriptions/plan-keys";
import { MEMBERSHIP_ROLE_RANK } from "@/lib/organization/navigation";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

assert(COMMERCIAL_PLAN_CATALOG.length === 4, "four commercial plans");

const servant = commercialPlanByKey(PLAN_KEYS.SERVANT_STANDARD)!;
const steward = commercialPlanByKey(PLAN_KEYS.STEWARD_PRO)!;
const shepherd = commercialPlanByKey(PLAN_KEYS.SHEPHERD_PLUS)!;
const omni = commercialPlanByKey(PLAN_KEYS.OMNI_ENTERPRISE)!;

assert(servant.usersActiveLimit === 10, "servant users 10");
assert(servant.monthlySmsSegmentLimit === 0, "servant sms 0");
assert(servant.monthlyPriceCents === 2995, "servant price");
assert(servant.subscriptionLookupKey === "servant_standard_monthly", "servant sub lookup");
assert(servant.smsPackageLookupKey === "servant_standard_sms_50", "servant sms lookup");
assert(servant.smsPackagePriceCents === 500, "servant sms price");

assert(steward.usersActiveLimit === 20, "steward users 20");
assert(steward.monthlySmsSegmentLimit === 250, "steward sms 250");
assert(steward.monthlyPriceCents === 3995, "steward price");
assert(steward.subscriptionLookupKey === "steward_pro_monthly", "steward sub lookup");
assert(steward.smsPackageLookupKey === "steward_pro_sms_100", "steward sms lookup");
assert(steward.smsPackagePriceCents === 1000, "steward sms price");

assert(shepherd.usersActiveLimit === 35, "shepherd users 35");
assert(shepherd.monthlySmsSegmentLimit === 500, "shepherd sms 500");
assert(shepherd.monthlyPriceCents === 5995, "shepherd price");
assert(shepherd.subscriptionLookupKey === "shepherd_plus_monthly", "shepherd sub lookup");
assert(shepherd.smsPackageLookupKey === "shepherd_plus_sms_200", "shepherd sms lookup");
assert(shepherd.smsPackagePriceCents === 2000, "shepherd sms price");

assert(omni.usersUnlimited === true, "omni users unlimited");
assert(omni.usersActiveLimit === null, "omni users null sentinel");
assert(omni.monthlySmsSegmentLimit === 1000, "omni sms 1000");
assert(omni.monthlyPriceCents === 15000, "omni price");
assert(omni.subscriptionLookupKey === "omni_enterprise_monthly", "omni sub lookup");
assert(omni.smsPackageLookupKey === "omni_enterprise_sms_500", "omni sms lookup");
assert(omni.smsPackagePriceCents === 4000, "omni sms price");

assert(
  smsPackageForPlan(PLAN_KEYS.STEWARD_PRO)?.smsExtraItemKey === "sms_block_100",
  "steward may only purchase sms_block_100",
);
assert(
  smsPackageForPlan(PLAN_KEYS.SERVANT_STANDARD)?.smsExtraItemKey !==
    "sms_block_500",
  "servant cannot resolve omni sms package",
);

// Expected matrix stays aligned with commercial catalog
assert(
  EXPECTED_PLAN_ENTITLEMENTS[PLAN_KEYS.SERVANT_STANDARD][
    FEATURE_KEYS.USERS_ACTIVE_LIMIT
  ] === 10,
  "matrix servant users",
);
assert(
  EXPECTED_PLAN_ENTITLEMENTS[PLAN_KEYS.STEWARD_PRO][
    FEATURE_KEYS.USERS_ACTIVE_LIMIT
  ] === 20,
  "matrix steward users",
);
assert(
  EXPECTED_PLAN_ENTITLEMENTS[PLAN_KEYS.SHEPHERD_PLUS][
    FEATURE_KEYS.SMS_MONTHLY_SEGMENT_LIMIT
  ] === 500,
  "matrix shepherd sms",
);
assert(
  EXPECTED_PLAN_ENTITLEMENTS[PLAN_KEYS.OMNI_ENTERPRISE][
    FEATURE_KEYS.USERS_ACTIVE_LIMIT
  ] === null,
  "matrix omni unlimited users",
);
assert(
  EXPECTED_PLAN_ENTITLEMENTS[PLAN_KEYS.OMNI_ENTERPRISE][
    FEATURE_KEYS.SMS_MONTHLY_SEGMENT_LIMIT
  ] === 1000,
  "matrix omni sms",
);

// Permission role mapping: admin read-only; owner/co-owner manage
const ownerPerms = new Set(ROLE_PERMISSION_MAPPING.owner ?? []);
const coOwnerPerms = new Set(ROLE_PERMISSION_MAPPING.co_owner ?? []);
const adminPerms = new Set(ROLE_PERMISSION_MAPPING.administrator ?? []);

for (const key of BILLING_MANAGE_PERMISSIONS) {
  assert(ownerPerms.has(key), `owner has ${key}`);
  assert(coOwnerPerms.has(key), `co_owner has ${key}`);
}
for (const key of BILLING_READ_PERMISSIONS) {
  assert(adminPerms.has(key), `administrator has ${key}`);
}
assert(
  !adminPerms.has(PERMISSION_KEYS.BILLING_MANAGE),
  "administrator lacks billing.manage",
);
assert(
  !adminPerms.has(PERMISSION_KEYS.BILLING_SUBSCRIPTION_MANAGE),
  "administrator lacks billing.subscription.manage",
);
assert(
  !adminPerms.has(PERMISSION_KEYS.BILLING_PAYMENT_METHOD_MANAGE),
  "administrator lacks billing.payment_method.manage",
);
assert(
  !adminPerms.has(PERMISSION_KEYS.BILLING_SMS_REPLENISHMENT_MANAGE),
  "administrator lacks billing.sms_replenishment.manage",
);
assert(
  MEMBERSHIP_ROLE_RANK.owner === MEMBERSHIP_ROLE_RANK.co_owner,
  "owner and co_owner share manage rank",
);
assert(
  MEMBERSHIP_ROLE_RANK.administrator < MEMBERSHIP_ROLE_RANK.owner,
  "administrator below owner for manage gates",
);

// Static guarantees: MFA SMS path stays outside org usage metering;
// delivery-id usage keys remain the debit idempotency contract.
const repoRoot = process.cwd();
const mfaSms = readFileSync(join(repoRoot, "lib/mfa/send-sms.ts"), "utf8");
assert(
  !mfaSms.includes("recordSmsSegmentsConsumed"),
  "MFA SMS must not call recordSmsSegmentsConsumed",
);
assert(
  !mfaSms.includes("subscription_usage"),
  "MFA SMS must not touch subscription_usage",
);

const usage = readFileSync(join(repoRoot, "lib/subscriptions/usage.ts"), "utf8");
assert(
  usage.includes("sms:consume:delivery:"),
  "SMS consume usage_key remains delivery-scoped",
);
assert(usage.includes("duplicate: true"), "usage recording remains idempotent");

const dispatch = readFileSync(
  join(repoRoot, "lib/notifications/dispatch-notification.ts"),
  "utf8",
);
assert(
  dispatch.includes("recordSmsSegmentsConsumed"),
  "application SMS dispatch still records segment usage",
);

console.log("billing commercial catalog selfcheck passed");
