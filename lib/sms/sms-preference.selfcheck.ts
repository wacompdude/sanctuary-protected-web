/**
 * SMS enrollment preference coherence (no database, no Bird, no send).
 * Run: npx --yes tsx lib/sms/sms-preference.selfcheck.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { COMMERCIAL_PLAN_CATALOG } from "@/lib/billing/commercial-catalog";
import { PLAN_KEYS } from "@/lib/subscriptions/plan-keys";
import {
  deliverySuppressionForDisabledPreference,
  evaluateSmsEligibility,
  suppressionReasonFromSmsEligibility,
} from "@/lib/sms/eligibility";
import {
  smsPreferenceActionForEnrollmentCompletion,
  smsPreferenceWriteForTrigger,
} from "@/lib/sms/sms-preference";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function readRepo(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function completion(existingSmsEnabled: boolean | null, overrides?: {
  consentGranted?: boolean;
  phoneVerified?: boolean;
  endpointActive?: boolean;
  providerSuppressed?: boolean;
}) {
  return smsPreferenceActionForEnrollmentCompletion({
    existingSmsEnabled,
    consentGranted: overrides?.consentGranted ?? true,
    phoneVerified: overrides?.phoneVerified ?? true,
    endpointActive: overrides?.endpointActive ?? true,
    providerSuppressed: overrides?.providerSuppressed ?? false,
  });
}

function main() {
  assert(
    smsPreferenceWriteForTrigger({
      trigger: "no_phone",
      existingSmsEnabled: null,
    }) === "unchanged",
    "1 no phone does not create an SMS preference",
  );

  assert(
    completion(null, { phoneVerified: false }) === "blocked",
    "2 unverified phone does not enable application SMS",
  );
  assert(
    smsPreferenceWriteForTrigger({
      trigger: "phone_unverified",
      existingSmsEnabled: null,
    }) === "unchanged",
    "2 unverified trigger does not write a preference",
  );

  assert(
    completion(null, { consentGranted: false }) === "blocked",
    "3 verified phone without consent does not enable application SMS",
  );
  assert(
    smsPreferenceWriteForTrigger({
      trigger: "consent_not_granted",
      existingSmsEnabled: null,
    }) === "unchanged",
    "3 missing consent does not write a preference",
  );

  assert(completion(null) === "initialize", "4 completed enrollment initializes SMS preference");

  assert(
    completion(true) === "unchanged",
    "5 repeating completed enrollment does not write again",
  );
  assert(
    smsPreferenceWriteForTrigger({
      trigger: "explicit_enrollment_completed",
      existingSmsEnabled: true,
    }) === "unchanged",
    "5 an already enabled preference is idempotent",
  );

  assert(
    smsPreferenceWriteForTrigger({
      trigger: "profile_save",
      existingSmsEnabled: false,
    }) === "unchanged",
    "6 an explicit SMS disable stays disabled",
  );

  assert(
    smsPreferenceWriteForTrigger({
      trigger: "profile_save",
      existingSmsEnabled: false,
    }) === "unchanged",
    "7 an unrelated profile save does not re-enable SMS",
  );

  assert(completion(false) === "reenable", "8 explicit re-enrollment enables SMS again");
  assert(
    smsPreferenceWriteForTrigger({
      trigger: "explicit_reenable",
      existingSmsEnabled: false,
    }) === "reenable",
    "8 explicit re-enable writes sms_enabled",
  );

  assert(
    completion(true, { providerSuppressed: true }) === "blocked",
    "9 provider suppression blocks preference initialization",
  );
  const stopped = evaluateSmsEligibility({
    organizationId: "org",
    userId: "user",
    phoneNumber: "+14155552671",
    organizationSmsEnabled: true,
    userSmsPreferenceEnabled: true,
    consentStatus: "granted",
    endpointStatus: "active",
    isVerified: true,
    suppressed: true,
  });
  assert(!stopped.allowed && stopped.reason === "SMS_SUPPRESSED", "9 STOP still blocks");
  assert(
    suppressionReasonFromSmsEligibility("SMS_SUPPRESSED") === "user_opted_out",
    "9 STOP remains user_opted_out",
  );
  assert(
    suppressionReasonFromSmsEligibility("SMS_OPTED_OUT") === "user_opted_out",
    "9 consent opt-out remains user_opted_out",
  );

  assert(
    smsPreferenceWriteForTrigger({
      trigger: "no_phone",
      existingSmsEnabled: null,
    }) === "unchanged",
    "10 a missing preference does not imply consent",
  );
  const missingConsent = evaluateSmsEligibility({
    organizationId: "org",
    userId: "user",
    phoneNumber: "+14155552671",
    organizationSmsEnabled: true,
    userSmsPreferenceEnabled: false,
    consentStatus: "unknown",
    endpointStatus: "unverified",
    isVerified: false,
    suppressed: false,
  });
  assert(
    !missingConsent.allowed && missingConsent.reason === "SMS_NOT_OPTED_IN",
    "10 missing consent fails before a preference can authorize SMS",
  );

  assert(
    smsPreferenceWriteForTrigger({
      trigger: "backfill",
      existingSmsEnabled: false,
    }) === "unchanged",
    "11 an existing disable is not bulk overwritten",
  );
  assert(
    smsPreferenceWriteForTrigger({
      trigger: "backfill",
      existingSmsEnabled: null,
    }) === "unchanged",
    "11 backfill does not create preferences for existing users",
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
    "12 organization SMS master still blocks",
  );
  assert(
    suppressionReasonFromSmsEligibility(orgOff.reason) === "provider_unavailable",
    "12 organization SMS disabled is not stored as an opt-out",
  );

  const eligible = evaluateSmsEligibility({
    organizationId: "org",
    userId: "user",
    phoneNumber: "+14155552671",
    organizationSmsEnabled: true,
    userSmsPreferenceEnabled: true,
    consentStatus: "granted",
    endpointStatus: "active",
    isVerified: true,
    suppressed: false,
  });
  assert(eligible.allowed && eligible.reason === "ALLOWED", "13 eligible recipient passes consent");

  const preferenceOff = evaluateSmsEligibility({
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
    !preferenceOff.allowed && preferenceOff.reason === "USER_PREFERENCE_DISABLED",
    "14 a disabled preference blocks before send",
  );
  assert(
    suppressionReasonFromSmsEligibility(preferenceOff.reason) === "channel_disabled",
    "14 a disabled preference is not stored as user_opted_out",
  );
  assert(
    deliverySuppressionForDisabledPreference("sms") === "channel_disabled",
    "14 audience SMS preference suppression is channel_disabled",
  );
  assert(
    deliverySuppressionForDisabledPreference("email") === "user_opted_out",
    "14 email preference reasons stay unchanged",
  );

  assert(
    smsPreferenceWriteForTrigger({
      trigger: "mfa_verification",
      existingSmsEnabled: null,
    }) === "unchanged",
    "16 MFA verification does not create an application SMS preference",
  );

  const servant = COMMERCIAL_PLAN_CATALOG.find(
    (plan) => plan.planKey === PLAN_KEYS.SERVANT_STANDARD,
  );
  assert(servant?.monthlySmsSegmentLimit === 0, "Servant included SMS remains 0");
  assert((servant?.smsPackageCredits ?? 0) > 0, "Servant can still have purchased SMS credits");

  const webActions = readRepo("app/(app)/profile/sms-actions.ts");
  const startFn = webActions.slice(
    webActions.indexOf("export async function startSmsEnrollmentAction"),
    webActions.indexOf("export async function verifySmsEnrollmentAction"),
  );
  const verifyFn = webActions.slice(
    webActions.indexOf("export async function verifySmsEnrollmentAction"),
    webActions.indexOf("export async function optOutSmsAction"),
  );
  const optOutFn = webActions.slice(
    webActions.indexOf("export async function optOutSmsAction"),
  );
  assert(
    !startFn.includes("enableSmsPreferenceAfterExplicitEnrollment"),
    "starting enrollment does not enable the preference before verification",
  );
  assert(
    verifyFn.includes("enableSmsPreferenceAfterExplicitEnrollment"),
    "web verification initializes the SMS preference",
  );
  assert(
    !optOutFn.includes("enableSmsPreferenceAfterExplicitEnrollment"),
    "opt-out does not re-enable the SMS preference",
  );

  const mobile = readRepo("lib/sms/mobile-profile.ts");
  const mobileVerify = mobile.slice(
    mobile.indexOf("export async function verifyMobileSmsEnrollment"),
    mobile.indexOf("export async function optOutMobileSms"),
  );
  const mobileStart = mobile.slice(
    mobile.indexOf("export async function startMobileSmsEnrollment"),
    mobile.indexOf("export async function verifyMobileSmsEnrollment"),
  );
  const mobilePhoneSave = mobile.slice(
    mobile.indexOf("export async function saveMobileProfilePhone"),
    mobile.indexOf("export async function startMobileSmsEnrollment"),
  );
  assert(
    mobileVerify.includes("enableSmsPreferenceAfterExplicitEnrollment"),
    "mobile verification initializes the SMS preference",
  );
  assert(
    !mobileStart.includes("enableSmsPreferenceAfterExplicitEnrollment"),
    "mobile start does not enable the preference before verification",
  );
  assert(
    !mobilePhoneSave.includes("enableSmsPreferenceAfterExplicitEnrollment"),
    "7 saving a profile phone does not re-enable SMS",
  );

  const mfa = readRepo("lib/mfa/enroll-phone.ts");
  assert(!mfa.includes("notification_preferences"), "16 MFA does not write notification preferences");
  assert(!mfa.includes("sms-preference"), "16 MFA does not use the application SMS preference helper");

  const preferenceHelper = readRepo("lib/sms/sms-preference.ts");
  assert(
    preferenceHelper.includes("sms_enabled: true") &&
      preferenceHelper.includes(".update({ sms_enabled: true })"),
    "an existing preference is updated only on the SMS flag",
  );
  assert(
    !preferenceHelper.includes("email_enabled"),
    "enrollment does not rewrite email preferences",
  );

  const audience = readRepo("lib/notifications/resolve-audience.ts");
  assert(
    audience.includes("deliverySuppressionForDisabledPreference(channel)"),
    "audience uses the SMS preference suppression reason",
  );
  assert(!audience.includes("reserveApplicationSmsSegments"), "14 audience does not reserve capacity");

  const dispatch = readRepo("lib/notifications/dispatch-notification.ts");
  const smsSend = dispatch.slice(dispatch.indexOf("async function sendSmsDelivery"));
  const eligibilityAt = smsSend.indexOf("canSendSms");
  const reserveAt = smsSend.indexOf("reserveApplicationSmsSegments");
  assert(eligibilityAt >= 0 && reserveAt > eligibilityAt, "13 capacity reservation stays after eligibility");
  assert(
    dispatch.includes('.in("status", ["pending", "queued"])'),
    "15 suppressed deliveries are not dispatched",
  );

  const webhook = readRepo("lib/sms/process-bird-webhook.ts");
  assert(webhook.includes("BIRD_SUPPRESSION"), "9 STOP suppression source remains");
  assert(
    webhook.includes("application SMS re-enrollment stays on Profile SMS"),
    "9 START does not auto-enroll",
  );

  console.log("sms-preference.selfcheck: ok");
}

main();
