import { SMS_BRAND_NAME } from "@/lib/legal/config";

export const MFA_SECTION_TITLE =
  "Sign-In Verification / Two-Factor Authentication";

export const MFA_SECTION_INTRO = `Sign-in verification is separate from ${SMS_BRAND_NAME} application SMS messaging. Enrolling in application SMS notifications is not required to use sign-in verification.`;

export const MFA_EMAIL_CODE_TITLE = "Email Code";

export const MFA_EMAIL_CODE_BODY =
  "Sent to your account email after password sign-in from a new or unrecognized device. Trusted devices can skip this code until they expire or you remove them.";

export const MFA_SMS_BACKUP_TITLE = "Text/SMS Backup";

export const MFA_SMS_BACKUP_BODY = `A verified mobile number may be used as a backup method for sign-in verification if you cannot access your email. This is separate from enrollment in ${SMS_BRAND_NAME} application SMS notifications.`;

export const MFA_NO_BACKUP_NUMBER =
  "No verified backup number yet. A phone typed at login is never trusted.";

export const MFA_PHONE_FIELD_HELPER =
  "Stored in international format after it is verified. We will send a Text/SMS to this number to confirm it is yours.";

export const MFA_SEND_VERIFICATION_LABEL = "Send verification Text/SMS";

export const MFA_PUBLIC_MANAGE_HELPER = `Sign-in verification, including Text/SMS backup, is managed from Profile after you sign in. Completing it does not enroll you in ${SMS_BRAND_NAME} application SMS messaging.`;
