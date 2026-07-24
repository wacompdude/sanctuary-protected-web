/**
 * Estimate billable SMS segments for a message body.
 * Uses a simplified GSM-7 / UCS-2 model matching common provider billing.
 */
const GSM7_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ ÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?" +
  "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";

const GSM7_EXTENDED = "^{}\\[~]|€";

export function isGsm7Compatible(text: string): boolean {
  for (const char of text) {
    if (GSM7_BASIC.includes(char) || GSM7_EXTENDED.includes(char)) continue;
    return false;
  }
  return true;
}

export function estimateSmsCodeUnits(text: string): {
  encoding: "gsm7" | "ucs2";
  units: number;
} {
  if (isGsm7Compatible(text)) {
    let units = 0;
    for (const char of text) {
      units += GSM7_EXTENDED.includes(char) ? 2 : 1;
    }
    return { encoding: "gsm7", units };
  }
  return { encoding: "ucs2", units: text.length };
}

/**
 * Segment count for one destination.
 * GSM-7: 160 single / 153 concatenated. UCS-2: 70 single / 67 concatenated.
 */
export function estimateSmsSegments(body: string): number {
  const trimmed = body ?? "";
  if (!trimmed) return 0;

  const { encoding, units } = estimateSmsCodeUnits(trimmed);
  if (encoding === "gsm7") {
    if (units <= 160) return 1;
    return Math.ceil(units / 153);
  }
  if (units <= 70) return 1;
  return Math.ceil(units / 67);
}

export function estimateSmsSegmentsForRecipients(params: {
  body: string;
  recipientCount: number;
}): number {
  const perMessage = estimateSmsSegments(params.body);
  const recipients = Math.max(0, Math.floor(params.recipientCount));
  return perMessage * recipients;
}
