import { inspectMobileNumber } from "@/lib/sms/phone";
import type { ConsentStatus, EndpointStatus } from "@/lib/notifications/endpoints/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export type SmsEligibilityReason =
  | "ALLOWED"
  | "NO_MOBILE_NUMBER"
  | "INVALID_MOBILE_NUMBER"
  | "PHONE_NOT_VERIFIED"
  | "SMS_NOT_OPTED_IN"
  | "SMS_OPTED_OUT"
  | "SMS_SUPPRESSED"
  | "DESTINATION_NOT_SUPPORTED"
  | "DESTINATION_DISABLED"
  | "ORGANIZATION_SMS_TIER_UNAVAILABLE"
  | "MONTHLY_SMS_LIMIT_REACHED"
  | "CATEGORY_DISABLED"
  | "USER_PREFERENCE_DISABLED"
  | "ORGANIZATION_SMS_DISABLED";

export type SmsEligibilityInput = {
  organizationId: string;
  userId: string;
  phoneNumber?: string | null;
  messageCategory?: string | null;
  organizationSmsEnabled?: boolean;
  userSmsPreferenceEnabled?: boolean;
  categoryEnabled?: boolean;
  consentStatus?: ConsentStatus | string | null;
  endpointStatus?: EndpointStatus | string | null;
  isVerified?: boolean;
  suppressed?: boolean;
  /** Trusted server client. Notification sends must not depend on a browser cookie. */
  client?: SupabaseClient;
};

export type SmsEligibilityResult = {
  allowed: boolean;
  reason: SmsEligibilityReason;
};

/**
 * Local fail-closed checks that do not hit subscription tables.
 * A stored mobile number is never enough by itself.
 */
export function evaluateSmsEligibility(
  input: SmsEligibilityInput,
): SmsEligibilityResult {
  if (input.organizationSmsEnabled === false) {
    return { allowed: false, reason: "ORGANIZATION_SMS_DISABLED" };
  }

  const raw = (input.phoneNumber ?? "").trim();
  if (!raw) {
    return { allowed: false, reason: "NO_MOBILE_NUMBER" };
  }

  const inspected = inspectMobileNumber(raw);
  if (!inspected.e164) {
    return { allowed: false, reason: "INVALID_MOBILE_NUMBER" };
  }
  if (!inspected.supported) {
    return {
      allowed: false,
      reason:
        inspected.region === "VI"
          ? "DESTINATION_DISABLED"
          : "DESTINATION_NOT_SUPPORTED",
    };
  }

  const consent = input.consentStatus ?? "unknown";
  if (consent === "revoked" || consent === "denied") {
    return { allowed: false, reason: "SMS_OPTED_OUT" };
  }
  if (consent !== "granted") {
    return { allowed: false, reason: "SMS_NOT_OPTED_IN" };
  }

  if (input.suppressed || input.endpointStatus === "revoked") {
    return { allowed: false, reason: "SMS_SUPPRESSED" };
  }

  if (!input.isVerified || input.endpointStatus !== "active") {
    return { allowed: false, reason: "PHONE_NOT_VERIFIED" };
  }

  if (input.userSmsPreferenceEnabled === false) {
    return { allowed: false, reason: "USER_PREFERENCE_DISABLED" };
  }
  if (input.categoryEnabled === false) {
    return { allowed: false, reason: "CATEGORY_DISABLED" };
  }

  return { allowed: true, reason: "ALLOWED" };
}

export function suppressionReasonFromSmsEligibility(
  reason: SmsEligibilityReason,
): string {
  switch (reason) {
    case "ALLOWED":
      return "provider_unavailable";
    case "NO_MOBILE_NUMBER":
    case "INVALID_MOBILE_NUMBER":
    case "PHONE_NOT_VERIFIED":
      return "endpoint_unverified";
    case "SMS_NOT_OPTED_IN":
      return "consent_missing";
    case "SMS_OPTED_OUT":
    case "SMS_SUPPRESSED":
      return "user_opted_out";
    case "DESTINATION_NOT_SUPPORTED":
    case "DESTINATION_DISABLED":
      return "endpoint_invalid";
    case "ORGANIZATION_SMS_TIER_UNAVAILABLE":
    case "ORGANIZATION_SMS_DISABLED":
      return "provider_unavailable";
    case "MONTHLY_SMS_LIMIT_REACHED":
      return "other";
    case "CATEGORY_DISABLED":
    case "USER_PREFERENCE_DISABLED":
      return "user_opted_out";
    default:
      return "provider_unavailable";
  }
}

/**
 * Non-billing eligibility used before every application SMS send.
 * A stored mobile number is never enough by itself.
 * Included allowance and purchased credits are decided later by the
 * atomic reservation RPC, which also rejects a cancelled subscription.
 */
export async function canSendSms(
  input: SmsEligibilityInput,
): Promise<SmsEligibilityResult> {
  return evaluateSmsEligibility(input);
}
