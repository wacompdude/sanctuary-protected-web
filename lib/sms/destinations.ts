/**
 * Central SMS destination policy for the Bird toll-free sender.
 * Override enabled regions with SMS_ENABLED_REGIONS=US,CA,PR
 * Do not enable VI unless this sender is confirmed to reach the U.S. Virgin Islands.
 */

export type SmsRegionCode = "US" | "CA" | "PR" | "VI" | "OTHER_NANP" | "INTERNATIONAL";

export type SmsDestinationPolicy = {
  region: SmsRegionCode;
  label: string;
  enabled: boolean;
  senderType: "toll_free";
  supportsTwoWay: boolean;
  notes: string;
};

const CANADA_NPAS = new Set([
  "204", "226", "236", "249", "250", "257", "263", "289", "306", "343", "354",
  "365", "367", "368", "382", "387", "403", "416", "418", "428", "431", "437",
  "438", "450", "468", "474", "506", "514", "519", "548", "579", "581", "584",
  "587", "604", "613", "639", "647", "672", "683", "705", "709", "742", "753",
  "778", "780", "782", "807", "819", "825", "867", "873", "879", "902", "905",
  "942",
]);

const DEFAULT_ENABLED = new Set<SmsRegionCode>(["US", "CA", "PR"]);

function enabledRegionsFromEnv(): Set<SmsRegionCode> {
  const raw = process.env.SMS_ENABLED_REGIONS?.trim();
  if (!raw) return new Set(DEFAULT_ENABLED);
  const parsed = raw
    .split(",")
    .map((part) => part.trim().toUpperCase())
    .filter((part): part is SmsRegionCode =>
      ["US", "CA", "PR", "VI", "OTHER_NANP", "INTERNATIONAL"].includes(part),
    );
  return parsed.length > 0 ? new Set(parsed) : new Set(DEFAULT_ENABLED);
}

export function listSmsDestinationPolicies(): SmsDestinationPolicy[] {
  const enabled = enabledRegionsFromEnv();
  return [
    {
      region: "US",
      label: "United States",
      enabled: enabled.has("US"),
      senderType: "toll_free",
      supportsTwoWay: true,
      notes: "Enabled when the Bird toll-free sender is approved for U.S. traffic.",
    },
    {
      region: "CA",
      label: "Canada",
      enabled: enabled.has("CA"),
      senderType: "toll_free",
      supportsTwoWay: true,
      notes: "Enabled when the Bird toll-free sender is approved for Canadian traffic.",
    },
    {
      region: "PR",
      label: "Puerto Rico",
      enabled: enabled.has("PR"),
      senderType: "toll_free",
      supportsTwoWay: true,
      notes: "Puerto Rico uses NANP +1 (787/939). Enable only if the sender routes there.",
    },
    {
      region: "VI",
      label: "U.S. Virgin Islands",
      enabled: enabled.has("VI"),
      senderType: "toll_free",
      supportsTwoWay: false,
      notes: "Area code 340. Keep disabled until Bird confirms this toll-free sender can reach USVI.",
    },
  ];
}

export function isSmsRegionEnabled(region: SmsRegionCode): boolean {
  return listSmsDestinationPolicies().some(
    (policy) => policy.region === region && policy.enabled,
  );
}

/** Classify a normalized E.164 number. +1 is not treated as universally equivalent. */
export function classifySmsRegion(e164: string): SmsRegionCode {
  const digits = e164.replace(/\D/g, "");
  if (!digits.startsWith("1") || digits.length !== 11) {
    return e164.startsWith("+") ? "INTERNATIONAL" : "OTHER_NANP";
  }
  const npa = digits.slice(1, 4);
  if (npa === "340") return "VI";
  if (npa === "787" || npa === "939") return "PR";
  if (CANADA_NPAS.has(npa)) return "CA";
  if (npa.length === 3) return "US";
  return "OTHER_NANP";
}

export function smsDestinationUnavailableMessage(region: SmsRegionCode): string {
  if (region === "VI") {
    return "SMS messaging is not currently available for this mobile number.";
  }
  return "SMS messaging is not currently available for this mobile number.";
}
