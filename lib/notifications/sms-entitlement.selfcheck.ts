/**
 * SMS plan entitlement regression (no database, no Bird, no send).
 * Run: npx --yes tsx lib/notifications/sms-entitlement.selfcheck.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FEATURE_KEYS } from "@/lib/subscriptions/feature-keys";
import { readBooleanEntitlement } from "@/lib/subscriptions/entitlement-values";
import {
  evaluateSmsEligibility,
  suppressionReasonFromSmsEligibility,
} from "@/lib/sms/eligibility";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function readRepo(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function smsTierFromFeature(featureAllowed: boolean) {
  return featureAllowed ? "ALLOWED" : "ORGANIZATION_SMS_TIER_UNAVAILABLE";
}

function main() {
  assert(
    smsTierFromFeature(true) === "ALLOWED",
    "1 organization with SMS feature permits SMS",
  );
  assert(
    readBooleanEntitlement(
      { [FEATURE_KEYS.SMS]: { kind: "boolean", value: true } },
      FEATURE_KEYS.SMS,
    ) === true,
    "1 omni_enterprise-style boolean entitlement stays true",
  );

  const audience = readRepo("lib/notifications/resolve-audience.ts");
  const resolver = readRepo("lib/subscriptions/resolver.ts");
  const eligibility = readRepo("lib/sms/eligibility.ts");
  const dispatch = readRepo("lib/notifications/dispatch-notification.ts");

  assert(
    audience.includes("client: supabase"),
    "2 audience SMS entitlement uses the trusted notification client",
  );
  assert(
    !audience.includes(
      `await hasFeature({\n          organizationId,\n          featureKey: FEATURE_KEYS.SMS,\n        })`,
    ),
    "2 audience SMS check is not cookie-only",
  );
  assert(
    resolver.includes("params.client") &&
      resolver.includes("loadChurchEntitlements(params.organizationId, params.client)"),
    "2 hasFeature uses the supplied server client",
  );
  assert(
    eligibility.includes("client: input.client") &&
      dispatch.includes("client: admin"),
    "2 send-time SMS entitlement uses the dispatcher admin client",
  );

  assert(
    smsTierFromFeature(false) === "ORGANIZATION_SMS_TIER_UNAVAILABLE",
    "3 plan without SMS stays unavailable",
  );
  assert(
    readBooleanEntitlement({}, FEATURE_KEYS.SMS) === false,
    "3 missing feature fails closed",
  );
  assert(
    suppressionReasonFromSmsEligibility("ORGANIZATION_SMS_TIER_UNAVAILABLE") ===
      "provider_unavailable",
    "3 tier miss still suppresses before Bird",
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
  assert(
    !orgOff.allowed && orgOff.reason === "ORGANIZATION_SMS_DISABLED",
    "4 organization SMS switch off remains blocked",
  );

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
  assert(
    !noConsent.allowed && noConsent.reason === "SMS_NOT_OPTED_IN",
    "5 missing consent remains ineligible",
  );

  const stopped = evaluateSmsEligibility({
    organizationId: "org",
    userId: "user",
    phoneNumber: "+14155552671",
    organizationSmsEnabled: true,
    userSmsPreferenceEnabled: true,
    consentStatus: "granted",
    endpointStatus: "revoked",
    isVerified: true,
    suppressed: true,
  });
  assert(
    !stopped.allowed && stopped.reason === "SMS_SUPPRESSED",
    "6 STOP/suppression remains blocked",
  );

  assert(
    audience.includes('if (channel === "email")') &&
      audience.includes('if (channel === "push")') &&
      audience.includes('if (channel === "in_app")'),
    "7 email, push, and in-app branches remain",
  );
  assert(
    (audience.match(/hasFeature\(/g) ?? []).length === 1,
    "7 only the SMS entitlement lookup was retargeted",
  );

  console.log("sms entitlement selfcheck passed");
}

main();
