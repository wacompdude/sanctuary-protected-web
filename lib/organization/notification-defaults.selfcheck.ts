/**
 * Organization notification channel defaults (no database, no send).
 * Run: npx --yes tsx lib/organization/notification-defaults.selfcheck.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_APP_PREFERENCES } from "@/lib/organization/settings";
import { canManageChurchSettings } from "@/lib/organization/settings";
import { canManageChurchNotificationSettings } from "@/lib/notifications/permissions";
import { evaluateSmsEligibility } from "@/lib/sms/eligibility";
import { readBooleanEntitlement } from "@/lib/subscriptions/entitlement-values";
import { FEATURE_KEYS } from "@/lib/subscriptions/feature-keys";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function readRepo(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

const migration = readRepo(
  "supabase/migrations/101_organization_notification_channel_defaults.sql",
);

assert(
  migration.includes("email_notifications_enabled = true") &&
    migration.includes("push_notifications_enabled = true") &&
    migration.includes("sms_notifications_enabled = true"),
  "1 existing settings rows are turned on once",
);
assert(
  migration.includes("NOT EXISTS") &&
    migration.includes("ON CONFLICT (organization_id) DO NOTHING"),
  "1 missing settings rows are inserted without duplicates",
);
assert(
  migration.includes("enable_email_notifications") &&
    migration.includes("enable_push_notifications") &&
    migration.includes("enable_sms_notifications"),
  "1 application preference checkboxes are turned on once",
);
assert(
  migration.includes("SET DEFAULT true"),
  "2 future rows default the three channels on",
);
assert(
  !migration.includes("notification_endpoints") &&
    !migration.includes("consent_status") &&
    !migration.includes("suppressed_at"),
  "8-10 migration does not touch consent, STOP, or endpoints",
);

assert(DEFAULT_APP_PREFERENCES.enable_email_notifications === true, "2 email default");
assert(DEFAULT_APP_PREFERENCES.enable_push_notifications === true, "2 push default");
assert(DEFAULT_APP_PREFERENCES.enable_sms_notifications === true, "2 sms default");

assert(canManageChurchSettings("owner"), "3 owner can change preferences");
assert(canManageChurchSettings("administrator"), "6 administrator can change preferences");
assert(canManageChurchSettings("co_owner"), "co-owner retains existing edit access");
assert(!canManageChurchSettings("security_leader"), "7 security leader cannot edit church settings");
assert(!canManageChurchSettings("security_member"), "7 member cannot edit church settings");
assert(canManageChurchNotificationSettings("owner"), "3 owner can change notification settings");
assert(
  canManageChurchNotificationSettings("administrator"),
  "6 administrator can change notification settings",
);
assert(
  !canManageChurchNotificationSettings("security_member"),
  "7 member cannot change notification settings",
);

const orgOff = evaluateSmsEligibility({
  organizationId: "org",
  userId: "user",
  phoneNumber: "+14155552671",
  organizationSmsEnabled: false,
  userSmsPreferenceEnabled: true,
  consentStatus: "granted",
  endpointStatus: "active",
  isVerified: true,
  suppressed: false,
});
assert(!orgOff.allowed && orgOff.reason === "ORGANIZATION_SMS_DISABLED", "15 org SMS off still blocks");

const noConsent = evaluateSmsEligibility({
  organizationId: "org",
  userId: "user",
  phoneNumber: "+14155552671",
  organizationSmsEnabled: true,
  userSmsPreferenceEnabled: true,
  consentStatus: "unknown",
  endpointStatus: "active",
  isVerified: true,
  suppressed: false,
});
assert(!noConsent.allowed && noConsent.reason === "SMS_NOT_OPTED_IN", "8 org SMS on does not grant consent");

const stopped = evaluateSmsEligibility({
  organizationId: "org",
  userId: "user",
  phoneNumber: "+14155552671",
  organizationSmsEnabled: true,
  userSmsPreferenceEnabled: true,
  consentStatus: "revoked",
  endpointStatus: "active",
  isVerified: true,
  suppressed: true,
});
assert(!stopped.allowed, "9 org SMS on does not clear STOP");

const prefOff = evaluateSmsEligibility({
  organizationId: "org",
  userId: "user",
  phoneNumber: "+14155552671",
  organizationSmsEnabled: true,
  userSmsPreferenceEnabled: false,
  consentStatus: "granted",
  endpointStatus: "active",
  isVerified: true,
  suppressed: false,
});
assert(
  !prefOff.allowed && prefOff.reason === "USER_PREFERENCE_DISABLED",
  "individual SMS preference still blocks",
);

assert(
  readBooleanEntitlement({}, FEATURE_KEYS.SMS) === false,
  "11 organization SMS on does not invent a plan entitlement",
);

const audience = readRepo("lib/notifications/resolve-audience.ts");
assert(
  audience.includes('settings.email_notifications_enabled') &&
    audience.includes("legacy?.email_enabled !== false"),
  "12 organization email on does not override a personal opt-out",
);
assert(
  audience.includes('channel === "push"') &&
    audience.includes("legacy?.push_enabled !== false"),
  "13 organization push on does not override a personal opt-out",
);
const composer = readRepo("app/(app)/notifications/composer-actions.ts");
assert(
  composer.includes("selected.length > 0 ? selected"),
  "14 web composer still honors explicit requested channels",
);
const mobileParser = readRepo("lib/notifications/mobile-api.ts");
assert(
  !mobileParser.includes('channels.push("push")') &&
    mobileParser.includes("selected.length > 0 ? selected"),
  "14 mobile channel selection is still explicit",
);

console.log("notification defaults selfcheck passed");
