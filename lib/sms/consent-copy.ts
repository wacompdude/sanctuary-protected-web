import {
  LEGAL_ROUTES,
  POLICY_VERSIONS,
  SMS_BRAND_NAME,
  SUPPORT_EMAIL,
} from "@/lib/legal/config";

/** Version of the on-screen SMS consent wording. Do not reuse after material edits. */
export const SMS_CONSENT_TEXT_VERSION = "sms-consent-v6";

/** @deprecated Use SMS_CONSENT_TEXT_VERSION for new enrollments. */
export const SMS_CONSENT_DISCLOSURE_VERSION = SMS_CONSENT_TEXT_VERSION;

export const SMS_SECTION_INTRO = `SMS messaging is optional and separate from saving your mobile number and from two-factor authentication. ${SMS_BRAND_NAME} sends application text messages only after you voluntarily opt in.`;

export const SMS_PHONE_SAVE_HELPER =
  "Saving a mobile number does not enroll you in application SMS messages.";

export const SMS_SECTION_HELPER =
  `Save a mobile phone number above, then choose whether to enable SMS messaging. ${SMS_PHONE_SAVE_HELPER} If you choose to enroll, your mobile number will be verified before SMS messaging is enabled.`;

/**
 * Primary consent paragraph shown above the checkbox.
 * Keep message categories aligned with Privacy Policy and Terms.
 */
export const SMS_CONSENT_BODY = `I agree to receive SMS text messages from ${SMS_BRAND_NAME} at the mobile number provided. Messages may include security alerts, incident notifications, scheduling updates, training and certification reminders, and account/service notifications based on my notification preferences.`;

/** @deprecated Prefer SMS_CONSENT_BODY for the disclosure paragraph. */
export const SMS_CONSENT_CHECKBOX_LABEL_LEGACY = SMS_CONSENT_BODY;

export const SMS_CONSENT_CHECKBOX_LABEL = `I agree to receive SMS messages from ${SMS_BRAND_NAME}.`;

export const SMS_CONSENT_FREQUENCY =
  "Message frequency varies based on organization activity and your notification preferences.";

export const SMS_CONSENT_RATES = "Message and data rates may apply.";

export const SMS_CONSENT_STOP = "Reply STOP to opt out";

export const SMS_CONSENT_HELP = "HELP for help";

/** Combined STOP/HELP sentence for the disclosure. */
export const SMS_CONSENT_STOP_HELP = `${SMS_CONSENT_STOP} or ${SMS_CONSENT_HELP}.`;

export const SMS_CONSENT_NOT_REQUIRED = `Consent to receive SMS messages is not a condition of purchase or use of ${SMS_BRAND_NAME}.`;

export const SMS_ENABLE_BUTTON_LABEL = "Verify Number & Enable SMS";

/** Web profile enrollment (Bird evidence). Distinct from MFA backup verification. */
export const SMS_CONSENT_SOURCE_PROFILE_WEB = "profile_web";

export function smsOnScreenConsentSnapshot(): string {
  return [
    SMS_CONSENT_BODY,
    `${SMS_CONSENT_FREQUENCY} ${SMS_CONSENT_RATES} ${SMS_CONSENT_STOP_HELP} ${SMS_CONSENT_NOT_REQUIRED}`,
    SMS_CONSENT_CHECKBOX_LABEL,
  ].join("\n\n");
}

export const SMS_PRIVACY_HREF = LEGAL_ROUTES.privacy;
export const SMS_TERMS_HREF = LEGAL_ROUTES.terms;
export const SMS_OPT_IN_HREF = "/sms";

export const SMS_MSG_DATA_RATES = "Msg & data rates may apply.";

/**
 * Carrier HELP auto-reply (application/service notification program).
 * Keep separate from MFA/2FA OTP wording. Not shown on enrollment screens.
 */
export function smsHelpReply(): string {
  return `${SMS_BRAND_NAME}: For help, contact ${SUPPORT_EMAIL}. Reply STOP to opt out.`;
}

/**
 * Enrollment confirmation after web opt-in or START.
 * Operational message only — not shown on enrollment screens.
 */
export function smsOptInConfirmation(): string {
  return `${SMS_BRAND_NAME}: You are enrolled in SMS notifications. Msg frequency varies. ${SMS_MSG_DATA_RATES} Reply HELP for help or STOP to opt out.`;
}

/**
 * STOP acknowledgment text for Bird/carrier configuration when a custom reply is requested.
 * Toll-free carriers may send their own STOP acknowledgments.
 */
export function smsStopReply(): string {
  return `${SMS_BRAND_NAME}: You have opted out of SMS notifications. No further messages will be sent.`;
}

export const SMS_HELP_REPLY = smsHelpReply();
export const SMS_ENROLLMENT_CONFIRMATION = smsOptInConfirmation();
export const SMS_STOP_REPLY = smsStopReply();

export function smsConsentPolicyVersions() {
  return {
    consentTextVersion: SMS_CONSENT_TEXT_VERSION,
    privacyPolicyVersion: POLICY_VERSIONS.privacy,
    termsVersion: POLICY_VERSIONS.terms,
  };
}
