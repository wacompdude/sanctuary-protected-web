/**
 * Profile phone entry. Users type a national number. E.164 stays internal.
 * +1 is the only automatic dialing code. Other codes are not prepended.
 */

export const NANP_DIALING_CODE = "+1";
export const TEN_DIGIT_PHONE_ERROR = "Enter a 10-digit phone number.";

export type DialingRegion = {
  regionCode: string;
  displayName: string;
  isoCountryCode: string;
  dialingCode: string;
  enabled: boolean;
  providerReady: boolean;
  sortOrder: number;
};

export type PhoneEntryMode =
  | {
      kind: "national";
      dialingCode: string;
      regions: DialingRegion[];
    }
  | {
      kind: "selector";
      regions: DialingRegion[];
    };

export function selectableDialingRegions(
  regions: DialingRegion[],
): DialingRegion[] {
  return regions
    .filter((region) => region.enabled && region.providerReady)
    .slice()
    .sort(
      (left, right) =>
        left.sortOrder - right.sortOrder ||
        left.displayName.localeCompare(right.displayName),
    );
}

export function distinctDialingCodes(regions: DialingRegion[]): string[] {
  return [
    ...new Set(selectableDialingRegions(regions).map((region) => region.dialingCode)),
  ];
}

/**
 * Selector visibility uses distinct dialing codes among regions that are both
 * platform-enabled and provider-ready. Several +1 regions stay one field.
 */
export function phoneEntryMode(regions: DialingRegion[]): PhoneEntryMode {
  const selectable = selectableDialingRegions(regions);
  const codes = [...new Set(selectable.map((region) => region.dialingCode))];
  if (codes.length <= 1) {
    return {
      kind: "national",
      dialingCode: codes[0] ?? NANP_DIALING_CODE,
      regions: selectable,
    };
  }
  return { kind: "selector", regions: selectable };
}

export function formatNationalNanpDisplay(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  const national =
    digits.length === 11 && digits.startsWith("1")
      ? digits.slice(1)
      : digits.length === 10
        ? digits
        : null;
  if (!national) return null;
  return `(${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6)}`;
}

/**
 * Current +1 profile field. Accepts common 10-digit formatting and an existing
 * +1 E.164 value. Does not prepend +1 onto other lengths.
 */
export function normalizeNanpNationalInput(
  raw: string,
): { e164: string } | { error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { error: TEN_DIGIT_PHONE_ERROR };

  if (trimmed.startsWith("+")) {
    const digits = trimmed.slice(1).replace(/\D/g, "");
    if (digits.length === 11 && digits.startsWith("1")) {
      return { e164: `+${digits}` };
    }
    return { error: TEN_DIGIT_PHONE_ERROR };
  }

  const digits = trimmed.replace(/\D/g, "");
  if (digits.length !== 10) return { error: TEN_DIGIT_PHONE_ERROR };
  return { e164: `+1${digits}` };
}

export function normalizeSelectedRegionInput(input: {
  nationalNumber: string;
  region: DialingRegion;
}): { e164: string } | { error: string } {
  if (input.region.dialingCode !== NANP_DIALING_CODE) {
    return {
      error: "SMS for this region is not available yet.",
    };
  }
  return normalizeNanpNationalInput(input.nationalNumber);
}
