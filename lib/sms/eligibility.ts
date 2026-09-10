import { FEATURE_KEYS } from "@/lib/subscriptions/feature-keys";
import { hasFeature, getFeatureLimit } from "@/lib/subscriptions/resolver";
import { getSmsSegmentUsageMeter } from "@/lib/subscriptions/usage";
import { inspectMobileNumber } from "@/lib/sms/phone";
import type { ConsentStatus, EndpointStatus } from "@/lib/notifications/endpoints/types";

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
      return "sms_suppressed";
    case "DESTINATION_NOT_SUPPORTED":
    case "DESTINATION_DISABLED":
      return "destination_unsupported";
    case "ORGANIZATION_SMS_TIER_UNAVAILABLE":
    case "ORGANIZATION_SMS_DISABLED":
      return "provider_unavailable";
    case "MONTHLY_SMS_LIMIT_REACHED":
      return "quota_exceeded";
    case "CATEGORY_DISABLED":
    case "USER_PREFERENCE_DISABLED":
      return "user_opted_out";
    default:
      return "provider_unavailable";
  }
}

/**
 * Fail-closed check used before every application SMS send.
 * A stored mobile number is never enough by itself.
 */
export async function canSendSms(
  input: SmsEligibilityInput,
): Promise<SmsEligibilityResult> {
  const local = evaluateSmsEligibility(input);
  if (!local.allowed) return local;

  const feature = await hasFeature({
    organizationId: input.organizationId,
    featureKey: FEATURE_KEYS.SMS,
  }).catch(() => ({ allowed: false }));
  if (!feature.allowed) {
    return { allowed: false, reason: "ORGANIZATION_SMS_TIER_UNAVAILABLE" };
  }

  try {
    const limit = await getFeatureLimit({
      organizationId: input.organizationId,
      featureKey: FEATURE_KEYS.SMS_MONTHLY_SEGMENT_LIMIT,
    });
    if (!limit.unlimited && (limit.limit ?? 0) <= 0) {
      return { allowed: false, reason: "ORGANIZATION_SMS_TIER_UNAVAILABLE" };
    }
    const meter = await getSmsSegmentUsageMeter(input.organizationId);
    if (
      !meter.unlimited &&
      meter.limit !== null &&
      meter.quantityCommitted >= meter.limit
    ) {
      return { allowed: false, reason: "MONTHLY_SMS_LIMIT_REACHED" };
    }
  } catch {
    // If usage tables are missing, fail closed for sends.
    return { allowed: false, reason: "ORGANIZATION_SMS_TIER_UNAVAILABLE" };
  }

  return { allowed: true, reason: "ALLOWED" };
}
