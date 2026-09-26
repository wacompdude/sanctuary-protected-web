import type { SupabaseClient } from "@supabase/supabase-js";
import {
  phoneEntryMode,
  type DialingRegion,
} from "@/lib/sms/phone-entry";

/** Matches the current production NANP policy until migration 102 is applied. */
export const BUILTIN_SMS_DIALING_REGIONS: DialingRegion[] = [
  {
    regionCode: "US",
    displayName: "United States",
    isoCountryCode: "US",
    dialingCode: "+1",
    enabled: true,
    providerReady: true,
    sortOrder: 10,
  },
  {
    regionCode: "CA",
    displayName: "Canada",
    isoCountryCode: "CA",
    dialingCode: "+1",
    enabled: true,
    providerReady: true,
    sortOrder: 20,
  },
  {
    regionCode: "PR",
    displayName: "Puerto Rico",
    isoCountryCode: "PR",
    dialingCode: "+1",
    enabled: true,
    providerReady: true,
    sortOrder: 30,
  },
];

export function isMissingDialingRegionTable(message: string): boolean {
  return /sms_dialing_regions|does not exist|schema cache|Could not find the table/i.test(
    message,
  );
}

function mapRegion(row: Record<string, unknown>): DialingRegion {
  return {
    regionCode: String(row.region_code),
    displayName: String(row.display_name),
    isoCountryCode: String(row.iso_country_code),
    dialingCode: String(row.dialing_code),
    enabled: Boolean(row.enabled),
    providerReady: Boolean(row.provider_ready),
    sortOrder: Number(row.sort_order ?? 0),
  };
}

export async function listSmsDialingRegions(
  supabase: SupabaseClient,
): Promise<{ source: "database" | "builtin"; regions: DialingRegion[] }> {
  const { data, error } = await supabase
    .from("sms_dialing_regions")
    .select(
      "region_code, display_name, iso_country_code, dialing_code, enabled, provider_ready, sort_order",
    )
    .order("sort_order", { ascending: true });

  if (error) {
    if (isMissingDialingRegionTable(error.message)) {
      return { source: "builtin", regions: BUILTIN_SMS_DIALING_REGIONS };
    }
    throw new Error(error.message);
  }

  if (!data || data.length === 0) {
    return { source: "builtin", regions: BUILTIN_SMS_DIALING_REGIONS };
  }

  return {
    source: "database",
    regions: data.map((row) => mapRegion(row as Record<string, unknown>)),
  };
}

export function currentPhoneEntry(regions: DialingRegion[]) {
  return phoneEntryMode(regions);
}

export const SMS_REGION_MANAGE_PERMISSION = "system.sms.manage_regions" as const;
