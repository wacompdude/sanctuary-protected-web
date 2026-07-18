/** Normalize email for dedupe / storage. */
export function normalizeEmail(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed || !trimmed.includes("@") || trimmed.length > 320) return null;
  return trimmed;
}

/**
 * Best-effort E.164 normalization for US-centric numbers.
 * Returns null when the value cannot be normalized confidently.
 */
export function normalizePhoneE164(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;

  if (raw.startsWith("+")) {
    const digits = raw.slice(1).replace(/\D/g, "");
    if (digits.length < 8 || digits.length > 15) return null;
    return `+${digits}`;
  }

  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  return null;
}

export function maskDestination(channel: string, destination: string): string {
  if (channel === "email") {
    const [local, domain] = destination.split("@");
    if (!local || !domain) return "***";
    const visible = local.slice(0, 1);
    return `${visible}***@${domain}`;
  }
  if (channel === "sms") {
    const digits = destination.replace(/\D/g, "");
    if (digits.length < 4) return "***";
    return `+***${digits.slice(-4)}`;
  }
  return "***";
}
