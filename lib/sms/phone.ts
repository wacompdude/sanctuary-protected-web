import { normalizePhoneE164 } from "@/lib/notifications/endpoints/normalize";
import {
  classifySmsRegion,
  isSmsRegionEnabled,
  smsDestinationUnavailableMessage,
  type SmsRegionCode,
} from "@/lib/sms/destinations";

export function normalizeMobileE164(value: string): string | null {
  return normalizePhoneE164(value);
}

export function formatNanpVoiceDisplay(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return `${digits.slice(1, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return null;
}

export function formatNanpDisplay(e164: string): string {
  const digits = e164.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return e164;
}

export function maskMobileE164(e164: string): string {
  const digits = e164.replace(/\D/g, "");
  if (digits.length < 4) return "(***) ***-****";
  return `(***) ***-${digits.slice(-4)}`;
}

export function inspectMobileNumber(raw: string): {
  e164: string | null;
  region: SmsRegionCode | null;
  supported: boolean;
  error?: string;
} {
  const e164 = normalizeMobileE164(raw);
  if (!e164) {
    return {
      e164: null,
      region: null,
      supported: false,
      error: "Enter a valid mobile number.",
    };
  }
  const region = classifySmsRegion(e164);
  if (!isSmsRegionEnabled(region)) {
    return {
      e164,
      region,
      supported: false,
      error: smsDestinationUnavailableMessage(region),
    };
  }
  return { e164, region, supported: true };
}
