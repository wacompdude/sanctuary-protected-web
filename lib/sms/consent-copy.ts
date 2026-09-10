import {
  LEGAL_ROUTES,
  POLICY_VERSIONS,
  PRODUCT_NAME,
  SUPPORT_EMAIL,
} from "@/lib/legal/config";
import { formatNanpVoiceDisplay } from "@/lib/sms/phone";

/** Version of the on-screen SMS consent wording. Do not reuse after material edits. */
export const SMS_CONSENT_TEXT_VERSION = "sms-consent-v2";

/** @deprecated Use SMS_CONSENT_TEXT_VERSION for new enrollments. */
export const SMS_CONSENT_DISCLOSURE_VERSION = SMS_CONSENT_TEXT_VERSION;

export const SMS_PROGRAM_NAME = "Alerts";

export const SMS_CONSENT_CHECKBOX_LABEL = `I agree to receive text messages from ${PRODUCT_NAME} at the mobile number provided, including security alerts, incident notifications, scheduling updates, training reminders, certification reminders, account notices, and other service messages I choose to receive.`;

export const SMS_CONSENT_FREQUENCY =
  "Message frequency varies based on your church's activity and the notification categories you select.";

export const SMS_CONSENT_RATES = "Message and data rates may apply.";

export const SMS_CONSENT_STOP = "Reply STOP to opt out.";

export const SMS_CONSENT_HELP = `Reply HELP for help, or email ${SUPPORT_EMAIL}.`;

export const SMS_CONSENT_NOT_REQUIRED =
  "Consent to receive SMS messages is not a condition of purchase or of using a paid subscription.";

export const SMS_PRIVACY_HREF = LEGAL_ROUTES.privacy;
export const SMS_TERMS_HREF = LEGAL_ROUTES.terms;
export const SMS_OPT_IN_HREF = "/sms";

export const SMS_MSG_DATA_RATES = "Msg&Data Rates May Apply.";

/** Voice number shown in HELP auto-replies. SUPPORT_PHONE, else the Bird sender. */
export function smsSupportPhoneDisplay(): string | null {
  const raw =
    process.env.SUPPORT_PHONE?.trim() ||
    process.env.BIRD_SMS_FROM?.trim() ||
    process.env.BIRD_FROM_NUMBER?.trim() ||
    "";
  if (!raw) return null;
  return formatNanpVoiceDisplay(raw) ?? raw;
}

/**
 * Carrier HELP auto-reply.
 * Example: Sanctuary Protected Help: For support, email support@… or call 844-555-0100. Reply STOP to opt out. Msg&Data Rates May Apply.
 */
export function smsHelpReply(phoneDisplay = smsSupportPhoneDisplay()): string {
  const contact = phoneDisplay
    ? `email ${SUPPORT_EMAIL} or call ${phoneDisplay}`
    : `email ${SUPPORT_EMAIL}`;
  return `${PRODUCT_NAME} Help: For support, ${contact}. Reply STOP to opt out. ${SMS_MSG_DATA_RATES}`;
}

/**
 * Carrier opt-in confirmation, sent after web enrollment or START.
 * Example: Welcome to Sanctuary Protected Alerts! Msg frequency varies. Reply STOP to unsubscribe, HELP for help. Msg&Data Rates May Apply.
 */
export function smsOptInConfirmation(): string {
  return `Welcome to ${PRODUCT_NAME} ${SMS_PROGRAM_NAME}! Msg frequency varies. Reply STOP to unsubscribe, HELP for help. ${SMS_MSG_DATA_RATES}`;
}

export const SMS_HELP_REPLY = smsHelpReply();
export const SMS_ENROLLMENT_CONFIRMATION = smsOptInConfirmation();

export function smsConsentPolicyVersions() {
  return {
    consentTextVersion: SMS_CONSENT_TEXT_VERSION,
    privacyPolicyVersion: POLICY_VERSIONS.privacy,
    termsVersion: POLICY_VERSIONS.terms,
  };
}

