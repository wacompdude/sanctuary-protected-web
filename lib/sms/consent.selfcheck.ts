/**
 * SMS consent, destination, and webhook self-check (no database required).
 * Run: npx --yes tsx lib/sms/consent.selfcheck.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHmac } from "node:crypto";
import {
  SMS_CONSENT_BODY,
  SMS_CONSENT_CHECKBOX_LABEL,
  SMS_CONSENT_FREQUENCY,
  SMS_CONSENT_HELP,
  SMS_CONSENT_NOT_REQUIRED,
  SMS_CONSENT_RATES,
  SMS_CONSENT_STOP,
  SMS_CONSENT_STOP_HELP,
  SMS_CONSENT_TEXT_VERSION,
  SMS_ENABLE_BUTTON_LABEL,
  SMS_MSG_DATA_RATES,
  SMS_PHONE_SAVE_HELPER,
  SMS_PRIVACY_HREF,
  SMS_SECTION_HELPER,
  SMS_TERMS_HREF,
  smsConsentPolicyVersions,
  smsHelpReply,
  smsOptInConfirmation,
  smsStopReply,
} from "@/lib/sms/consent-copy";
import {
  classifySmsRegion,
  isSmsRegionEnabled,
  listSmsDestinationPolicies,
} from "@/lib/sms/destinations";
import { inspectMobileNumber, maskMobileE164, normalizeMobileE164 } from "@/lib/sms/phone";
import { enrollmentStateFromEndpoint } from "@/lib/sms/consent";
import {
  evaluateSmsEligibility,
  suppressionReasonFromSmsEligibility,
} from "@/lib/sms/eligibility";
import {
  classifyInboundSmsKeyword,
  extractBirdWebhookEvent,
  verifyBirdWebhookRequest,
} from "@/lib/sms/bird-webhook";
import { birdCategoryForAppMessage } from "@/lib/sms/bird-send";
import { formatApplicationNotificationSms } from "@/lib/sms/format-notification-sms";
import { getSmsProvider, getSmsProviderStatus } from "@/lib/notifications/providers/sms-provider";
import { PRODUCT_NAME, SMS_BRAND_NAME } from "@/lib/legal/config";
import { OPERATIONAL_ALERT_CHANNELS } from "@/lib/notifications/constants";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function readRepo(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function main() {
  assert(PRODUCT_NAME === "Sanctuary Protected LLC", "legal business name");
  assert(SMS_BRAND_NAME === "Sanctuary Protected LLC", "SMS brand name");
  assert(SMS_CONSENT_TEXT_VERSION === "sms-consent-v6", "consent text version");
  assert(SMS_CONSENT_BODY.includes(SMS_BRAND_NAME), "consent body names SMS brand");
  assert(SMS_CONSENT_BODY.includes("Sanctuary Protected LLC"), "consent uses legal business name");
  assert(
    !SMS_CONSENT_BODY.toLowerCase().includes("other service messages"),
    "no broad other-service-messages wording",
  );
  assert(
    SMS_CONSENT_BODY.includes("security alerts") &&
      SMS_CONSENT_BODY.includes("incident notifications") &&
      SMS_CONSENT_BODY.includes("scheduling updates") &&
      SMS_CONSENT_BODY.includes("training and certification reminders") &&
      SMS_CONSENT_BODY.includes("account/service notifications"),
    "consent lists approved message categories",
  );
  assert(
    SMS_CONSENT_CHECKBOX_LABEL ===
      `I agree to receive SMS messages from ${SMS_BRAND_NAME}.`,
    "checkbox label",
  );
  assert(SMS_CONSENT_FREQUENCY.toLowerCase().includes("frequency varies"), "frequency");
  assert(SMS_CONSENT_RATES.toLowerCase().includes("message and data rates"), "rates");
  assert(SMS_CONSENT_STOP.includes("STOP"), "stop");
  assert(SMS_CONSENT_HELP.includes("HELP"), "help");
  assert(SMS_CONSENT_STOP_HELP.includes("STOP") && SMS_CONSENT_STOP_HELP.includes("HELP"), "stop/help sentence");
  assert(SMS_CONSENT_NOT_REQUIRED.toLowerCase().includes("not a condition"), "not required");
  assert(SMS_MSG_DATA_RATES === "Msg & data rates may apply.", "carrier rates phrase");
  assert(
    SMS_SECTION_HELPER ===
      `Save a mobile phone number above, then choose whether to enable SMS messaging. ${SMS_PHONE_SAVE_HELPER} If you choose to enroll, your mobile number will be verified before SMS messaging is enabled.`,
    "enrollment helper matches verify-then-enable flow",
  );
  assert(
    SMS_PHONE_SAVE_HELPER ===
      "Saving a mobile number does not enroll you in application SMS messages.",
    "saving a number is not consent",
  );
  assert(SMS_ENABLE_BUTTON_LABEL === "Verify Number & Enable SMS", "enable button label");

  const help = smsHelpReply();
  assert(help.startsWith("Sanctuary Protected LLC:"), "HELP names brand");
  assert(help.includes("support@sanctuaryprotected.com"), "HELP includes support email");
  assert(help.includes("Reply STOP to opt out"), "HELP includes STOP");
  assert(!help.toLowerCase().includes("two-factor"), "HELP is not MFA copy");

  const confirm = smsOptInConfirmation();
  assert(
    confirm.startsWith(
      "Sanctuary Protected LLC: You are enrolled in SMS notifications.",
    ),
    "opt-in confirmation",
  );
  assert(confirm.includes("Msg frequency varies"), "opt-in frequency");
  assert(confirm.includes("Reply HELP for help or STOP to opt out"), "opt-in HELP/STOP");
  assert(confirm.includes(SMS_MSG_DATA_RATES), "opt-in rates");

  const stop = smsStopReply();
  assert(
    stop ===
      "Sanctuary Protected LLC: You have opted out of SMS notifications. No further messages will be sent.",
    "STOP reply copy",
  );

  assert(SMS_PRIVACY_HREF === "/privacy", "privacy href");
  assert(SMS_TERMS_HREF === "/terms", "terms href");

  const versions = smsConsentPolicyVersions();
  assert(Boolean(versions.privacyPolicyVersion), "privacy version captured");
  assert(Boolean(versions.termsVersion), "terms version captured");

  assert(normalizeMobileE164("425-555-1234") === "+14255551234", "US E.164");
  assert(normalizeMobileE164("+14165551234") === "+14165551234", "CA E.164");
  assert(normalizeMobileE164("787-555-1234") === "+17875551234", "PR E.164");
  assert(classifySmsRegion("+14255551234") === "US", "US region");
  assert(classifySmsRegion("+14165551234") === "CA", "CA region");
  assert(classifySmsRegion("+17875551234") === "PR", "PR region");
  assert(classifySmsRegion("+13405551234") === "VI", "USVI region");
  assert(isSmsRegionEnabled("US"), "US enabled");
  assert(isSmsRegionEnabled("CA"), "CA enabled");
  assert(isSmsRegionEnabled("PR"), "PR enabled");
  assert(!isSmsRegionEnabled("VI"), "USVI disabled by default");
  assert(inspectMobileNumber("425-555-1234").supported, "US enrollable");
  assert(inspectMobileNumber("+14165551234").supported, "CA enrollable");
  assert(inspectMobileNumber("+17875551234").supported, "PR enrollable");
  assert(!inspectMobileNumber("+13405551234").supported, "USVI blocked");
  assert(
    Boolean(
      inspectMobileNumber("+13405551234").error?.includes(
        "SMS messaging is not currently available",
      ),
    ),
    "USVI message",
  );
  assert(maskMobileE164("+14255551234") === "(***) ***-1234", "mask");

  const previousRegions = process.env.SMS_ENABLED_REGIONS;
  process.env.SMS_ENABLED_REGIONS = "US,CA,PR,VI";
  assert(isSmsRegionEnabled("VI"), "USVI can be enabled by config");
  if (previousRegions === undefined) delete process.env.SMS_ENABLED_REGIONS;
  else process.env.SMS_ENABLED_REGIONS = previousRegions;
  assert(!isSmsRegionEnabled("VI"), "USVI returns to default after env reset");

  assert(
    listSmsDestinationPolicies().every((policy) => policy.senderType === "toll_free"),
    "central destination policies",
  );

  assert(
    enrollmentStateFromEndpoint({ consentStatus: "unknown" }) === "NOT_ENROLLED",
    "phone without consent is not enrolled",
  );
  assert(
    enrollmentStateFromEndpoint({
      consentStatus: "granted",
      isVerified: true,
      status: "active",
    }) === "OPTED_IN",
    "granted verified active is opted in",
  );

  const phoneOnly = evaluateSmsEligibility({
    organizationId: "org",
    userId: "user",
    phoneNumber: "+14255551234",
    consentStatus: "unknown",
  });
  assert(!phoneOnly.allowed && phoneOnly.reason === "SMS_NOT_OPTED_IN", "number is not consent");

  const optedOut = evaluateSmsEligibility({
    organizationId: "org",
    userId: "user",
    phoneNumber: "+14255551234",
    consentStatus: "revoked",
    isVerified: true,
    endpointStatus: "active",
  });
  assert(!optedOut.allowed && optedOut.reason === "SMS_OPTED_OUT", "opt-out blocks send");

  const suppressed = evaluateSmsEligibility({
    organizationId: "org",
    userId: "user",
    phoneNumber: "+14255551234",
    consentStatus: "granted",
    isVerified: true,
    endpointStatus: "active",
    suppressed: true,
  });
  assert(!suppressed.allowed && suppressed.reason === "SMS_SUPPRESSED", "suppression wins");
  assert(
    suppressionReasonFromSmsEligibility("SMS_SUPPRESSED") === "user_opted_out",
    "suppression mapping",
  );

  const viBlocked = evaluateSmsEligibility({
    organizationId: "org",
    userId: "user",
    phoneNumber: "+13405551234",
    consentStatus: "granted",
    isVerified: true,
    endpointStatus: "active",
  });
  assert(!viBlocked.allowed && viBlocked.reason === "DESTINATION_DISABLED", "USVI cannot enroll/send");

  const allowed = evaluateSmsEligibility({
    organizationId: "org",
    userId: "user",
    phoneNumber: "+14255551234",
    consentStatus: "granted",
    isVerified: true,
    endpointStatus: "active",
  });
  assert(allowed.allowed, "US opted-in verified number can pass local checks");

  assert(classifyInboundSmsKeyword("STOP please") === "STOP", "STOP");
  assert(classifyInboundSmsKeyword("STOPALL") === "STOP", "STOPALL");
  assert(classifyInboundSmsKeyword("END") === "STOP", "END");
  assert(classifyInboundSmsKeyword("QUIT") === "STOP", "QUIT");
  assert(classifyInboundSmsKeyword("CANCEL") === "STOP", "CANCEL");
  assert(classifyInboundSmsKeyword("UNSUBSCRIBE") === "STOP", "UNSUBSCRIBE");
  assert(classifyInboundSmsKeyword("START") === "START", "START");
  assert(classifyInboundSmsKeyword("HELP") === "HELP", "HELP");

  const secret = "whsec_" + Buffer.from("sms-test-secret").toString("base64");
  const body = JSON.stringify({ type: "preference.revoked", data: { channel: "sms" } });
  const webhookId = "msg_test";
  const timestamp = String(Math.floor(Date.now() / 1000));
  const key = Buffer.from(secret.slice("whsec_".length), "base64");
  const signature =
    "v1," +
    createHmac("sha256", key).update(`${webhookId}.${timestamp}.${body}`).digest("base64");
  assert(
    verifyBirdWebhookRequest({
      payload: body,
      secret,
      webhookId,
      timestamp,
      signature,
    }),
    "valid Bird signature accepted",
  );
  assert(
    !verifyBirdWebhookRequest({
      payload: body,
      secret,
      webhookId,
      timestamp,
      signature: "v1,invalid",
    }),
    "invalid signature rejected",
  );
  assert(
    !verifyBirdWebhookRequest({
      payload: body,
      secret,
      signature: "",
    }),
    "unsigned request rejected",
  );

  assert(birdCategoryForAppMessage("operational") === "service", "no marketing category");
  assert(birdCategoryForAppMessage("enrollment_otp") === "authentication", "otp is auth");

  const enrollmentUi = readRepo("components/sms/sms-consent-disclosure.tsx");
  assert(!enrollmentUi.includes("defaultChecked"), "consent checkbox is not pre-checked");
  assert(enrollmentUi.includes('type="checkbox"'), "native checkbox");
  assert(enrollmentUi.includes('htmlFor={consentId}'), "checkbox has a label");
  assert(enrollmentUi.includes("Privacy Policy"), "privacy link visible");
  assert(enrollmentUi.includes("Terms of Service"), "terms link visible");
  assert(enrollmentUi.includes("SMS_PRIVACY_HREF"), "uses real privacy route");
  assert(enrollmentUi.includes("SMS_TERMS_HREF"), "uses real terms route");

  const profileEnrollment = readRepo("components/profile/profile-sms-enrollment.tsx");
  assert(profileEnrollment.includes("disabled={!agreed || !phoneValid"), "enable disabled until checked and valid phone");
  assert(profileEnrollment.includes("SmsConsentDisclosure"), "profile uses shared disclosure");
  assert(profileEnrollment.includes("SmsMessagingCard"), "profile uses shared SMS card");
  assert(!profileEnrollment.includes("SmsAutomatedReplies"), "profile does not show automated replies");
  assert(profileEnrollment.includes("SMS_ENABLE_BUTTON_LABEL"), "profile CTA matches public form");

  const publicOptIn = readRepo("components/sms/public-sms-opt-in.tsx");
  assert(publicOptIn.includes("SmsConsentDisclosure"), "public page uses shared disclosure");
  assert(publicOptIn.includes("SmsMessagingCard"), "public page uses shared SMS card");
  assert(publicOptIn.includes("disabled={!agreed || !phoneValid}"), "public enable disabled until checked and valid phone");
  assert(!publicOptIn.includes("startSmsEnrollmentAction"), "public page does not enroll visitors");
  assert(publicOptIn.includes("Not Enrolled"), "public page shows not enrolled");
  assert(publicOptIn.includes("PublicSignInVerificationCard"), "public page shows 2FA distinction card");

  const publicPage = readRepo("app/(legal)/sms/page.tsx");
  assert(publicPage.includes("PublicSmsOptInForm"), "public SMS page uses shared form");
  assert(!publicPage.includes("SmsAutomatedReplies"), "public SMS page does not show automated replies");
  assert(!publicPage.includes("createClient"), "public SMS page must not create a Supabase client");
  assert(!publicPage.includes("smsHelpReply"), "HELP copy not shown on enrollment page");
  assert(!publicPage.includes("smsStopReply"), "STOP copy not shown on enrollment page");

  const mfaCopy = readRepo("lib/mfa/copy.ts");
  assert(mfaCopy.includes("Sign-In Verification / Two-Factor Authentication"), "MFA heading distinguishes 2FA");
  assert(mfaCopy.includes("separate from"), "MFA copy distinguishes application SMS");
  assert(mfaCopy.includes("not required to use sign-in verification"), "MFA enrollment is optional vs application SMS");

  const mfaSettings = readRepo("components/mfa/profile-mfa-settings.tsx");
  assert(mfaSettings.includes("SignInVerificationCard"), "profile MFA uses shared 2FA card");

  const profileForm = readRepo("components/profile/profile-form.tsx");
  assert(profileForm.includes("Mobile Phone"), "profile labels mobile phone");
  assert(profileForm.includes("SMS_PHONE_SAVE_HELPER"), "profile phone save uses shared helper");

  const smsActions = readRepo("app/(app)/profile/sms-actions.ts");
  assert(smsActions.includes("SMS_CONSENT_SOURCE_PROFILE_WEB"), "web consent source recorded");
  assert(smsActions.includes("smsOnScreenConsentSnapshot"), "consent text snapshot stored");
  assert(smsActions.includes("sms_opt_out_timestamp"), "opt-out timestamp stored");
  const optOutFn = smsActions.slice(smsActions.indexOf("export async function optOutSmsAction"));
  assert(!optOutFn.includes("consent_recorded_at"), "opt-out does not overwrite consent timestamp");

  const publicOptInForm = readRepo("components/sms/public-sms-opt-in.tsx");
  assert(publicOptInForm.includes("SMS_PHONE_SAVE_HELPER"), "public phone save uses shared helper");

  const mfaCard = readRepo("app/(app)/profile/page.tsx");
  assert(mfaCard.includes("ProfileSmsEnrollment"), "SMS enrollment on profile");
  assert(mfaCard.includes("ProfileMfaSettings"), "MFA remains a separate section");

  const endpointsPanel = readRepo("components/notifications/notification-endpoints-panel.tsx");
  assert(!endpointsPanel.includes("defaultChecked"), "preferences panel has no pre-checked SMS consent");
  assert(endpointsPanel.includes('href="/profile"'), "preferences point to profile enrollment");

  const webhookRoute = readRepo("app/api/notifications/webhooks/bird/route.ts");
  assert(webhookRoute.includes("processBirdWebhook"), "Bird webhook route exists");
  const processor = readRepo("lib/sms/process-bird-webhook.ts");
  assert(processor.includes("Invalid webhook signature"), "webhook authenticity required");
  assert(processor.includes("sms_suppression.created"), "STOP uses Bird suppression events");
  assert(processor.includes("BIRD_SUPPRESSION"), "suppression source recorded");
  assert(processor.includes("application SMS re-enrollment stays on Profile SMS"), "START does not auto-enroll");
  assert(processor.includes("sendSmsHelpReply"), "HELP reply remains available");
  assert(processor.includes("SMS_HELP_REPLY"), "HELP reply is env-gated");
  assert(!processor.includes("sendSmsEnrollmentConfirmation"), "START does not send opt-in confirmation");

  const delivered = extractBirdWebhookEvent({
    type: "sms.delivered",
    timestamp: "2026-06-10T14:30:00Z",
    data: {
      sms_id: "sms_01krdgeqcxet5s7t44vh8rt9mg",
      workspace_id: "ws_01krdgeqcxet5s7t44vh8rt9mg",
      to: "+15551234567",
      from: "+18445193919",
    },
  });
  assert(delivered.smsId === "sms_01krdgeqcxet5s7t44vh8rt9mg", "delivered sms_id");
  assert(delivered.to === "+15551234567", "delivered recipient");
  assert(delivered.from === "+18445193919", "delivered sender");

  const received = extractBirdWebhookEvent({
    type: "sms.received",
    data: {
      sms_id: "sms_inbound_1",
      from: "+14255551212",
      to: "+18445193919",
      body: "HELP",
    },
  });
  assert(received.from === "+14255551212", "received from is subscriber");
  assert(received.to === "+18445193919", "received to is Sanctuary sender");
  assert(classifyInboundSmsKeyword(received.body) === "HELP", "HELP keyword");

  const suppression = extractBirdWebhookEvent({
    type: "sms_suppression.created",
    data: {
      suppression_id: "ssu_1",
      destination: "+14255551212",
      originator: "+18445193919",
      reason: "keyword_stop",
    },
  });
  assert(suppression.suppressionDestination === "+14255551212", "suppression destination");
  assert(suppression.suppressionOriginator === "+18445193919", "suppression originator");
  assert(suppression.from === "+14255551212", "suppression from is subscriber not originator");

  const preference = extractBirdWebhookEvent({
    type: "preference.revoked",
    data: {
      preference_id: "prf_1",
      channel: "sms",
      handle: "+15550001234",
      coverage: "non_transactional",
      topic_id: null,
      sender_scope: null,
    },
  });
  assert(preference.preference === "revoked", "preference type");
  assert(preference.channel === "sms", "preference channel");
  assert(preference.handle === "+15550001234", "preference handle");

  const migration = readRepo("supabase/migrations/099_sms_consent_management.sql");
  assert(migration.includes("sms_consent_events"), "consent history table");
  assert(migration.includes("sms_phone_verifications"), "verification table");
  assert(migration.includes("REVOKE UPDATE, DELETE"), "consent history is append-only for clients");

  const formatted = formatApplicationNotificationSms({
    title: "Security incident reported at First Church",
    severity: "high",
    notificationType: "incident.created",
  });
  assert(formatted.startsWith(`${SMS_BRAND_NAME}:`), "application SMS names brand");
  assert(formatted.includes("[HIGH]"), "application SMS includes severity");
  assert(
    formatted.includes("Open Sanctuary Protected for details."),
    "application SMS directs to the app",
  );
  assert(!formatted.toLowerCase().includes("medical"), "application SMS omits medical detail");

  assert(OPERATIONAL_ALERT_CHANNELS.includes("sms"), "alerts include SMS channel");
  const dispatcher = readRepo("lib/notifications/dispatch-notification.ts");
  assert(dispatcher.includes('["email", "push", "sms"]'), "dispatcher queries SMS deliveries");
  assert(dispatcher.includes("sendSmsDelivery"), "dispatcher sends SMS");
  assert(dispatcher.includes("formatApplicationNotificationSms"), "dispatcher formats SMS");
  assert(dispatcher.includes("canSendSms"), "dispatcher re-checks SMS eligibility");
  const webhookProcessor = readRepo("lib/sms/process-bird-webhook.ts");
  assert(webhookProcessor.includes("deliveryStatusRank"), "webhook does not regress sent to queued");
  assert(
    webhookProcessor.includes('.eq("provider", "bird")'),
    "webhook correlates by provider bird",
  );
  assert(
    webhookProcessor.includes('.eq("provider_message_id", smsId)'),
    "webhook correlates by Bird sms_id",
  );

  const previousSmsProvider = process.env.SMS_PROVIDER;
  process.env.SMS_PROVIDER = "console";
  const consoleStatus = getSmsProviderStatus();
  assert(getSmsProvider().name === "console", "SMS_PROVIDER=console selects console");
  assert(consoleStatus.configured, "console SMS provider is configured");
  assert(consoleStatus.provider === "console", "console status name");
  if (previousSmsProvider === undefined) {
    delete process.env.SMS_PROVIDER;
  } else {
    process.env.SMS_PROVIDER = previousSmsProvider;
  }

  console.log("sms consent self-check passed");
}

main();
