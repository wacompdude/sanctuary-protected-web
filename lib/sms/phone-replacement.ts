import { normalizeNanpNationalInput } from "@/lib/sms/phone-entry";

export const SAME_MOBILE_NUMBER_MESSAGE =
  "This is already your current mobile number.";

export const CARRIER_STOP_MESSAGE =
  "SMS cannot currently be enabled for this number because text messaging was stopped. Reply START to the last Sanctuary Protected text, then try again from Profile.";

export function normalizedProfilePhone(
  value: string | null | undefined,
): string | null {
  if (!value?.trim()) return null;
  const parsed = normalizeNanpNationalInput(value);
  return "e164" in parsed ? parsed.e164 : null;
}

/** Same stored number, including national display such as (425) 314-5817. */
export function profilePhoneUnchanged(
  stored: string | null | undefined,
  entered: string | null | undefined,
): boolean {
  const previous = normalizedProfilePhone(stored);
  const next = normalizedProfilePhone(entered);
  return Boolean(previous && next && previous === next);
}

/** Saving a profile phone never disables an application SMS endpoint. */
export function profileSaveTouchesSmsEndpoint(): false {
  return false;
}

/** Profile verification must not clear carrier or provider STOP. */
export function profileVerificationClearsCarrierSuppression(): false {
  return false;
}

export function carrierSuppressionBlocksProfileEnrollment(
  suppressedAt: string | null | undefined,
): boolean {
  return Boolean(suppressedAt);
}

export function showVerificationCodeField(challengeActive: boolean): boolean {
  return challengeActive;
}

export type SmsDeliveryEndpoint = {
  id: string;
  e164: string;
  isPrimary: boolean;
  status: "active" | "disabled" | "unverified" | "revoked";
  consent: "unknown" | "pending" | "granted" | "revoked" | "denied";
  verified: boolean;
  suppressedAt: string | null;
};

export function activeApplicationSmsEndpoint(
  endpoints: SmsDeliveryEndpoint[],
): SmsDeliveryEndpoint | null {
  return (
    endpoints.find(
      (endpoint) =>
        endpoint.isPrimary &&
        endpoint.status === "active" &&
        endpoint.verified &&
        endpoint.consent === "granted" &&
        !endpoint.suppressedAt,
    ) ?? null
  );
}

export function verifiedEnrollmentPatch(): {
  consent_status: "granted";
  is_verified: true;
  status: "active";
  is_primary: true;
} {
  return {
    consent_status: "granted",
    is_verified: true,
    status: "active",
    is_primary: true,
  };
}

export function retirePreviousSmsPatch(): {
  is_primary: false;
  status: "disabled";
} {
  return { is_primary: false, status: "disabled" };
}

export function profileOptOutPatch(): {
  consent_status: "revoked";
  status: "disabled";
} {
  return { consent_status: "revoked", status: "disabled" };
}
