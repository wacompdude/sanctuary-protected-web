/**
 * Run: npx --yes tsx lib/sms/phone-entry.selfcheck.ts
 */
import {
  hasPermissionInSet,
  resolvePermissionsFromRoleKeys,
} from "@/lib/platform/expected-matrix";
import { isPlatformPermissionKey } from "@/lib/platform/permission-keys";
import { PLATFORM_ROLE_KEYS, isPlatformRoleKey } from "@/lib/platform/role-keys";
import { SMS_REGION_MANAGE_PERMISSION } from "@/lib/sms/dialing-regions";
import {
  BUILTIN_SMS_DIALING_REGIONS,
} from "@/lib/sms/dialing-regions";
import {
  NANP_DIALING_CODE,
  distinctDialingCodes,
  formatNationalNanpDisplay,
  normalizeNanpNationalInput,
  normalizeSelectedRegionInput,
  phoneEntryMode,
  selectableDialingRegions,
  type DialingRegion,
} from "@/lib/sms/phone-entry";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function e164(result: { e164: string } | { error: string }): string | undefined {
  return "e164" in result ? result.e164 : undefined;
}

assert(e164(normalizeNanpNationalInput("4255551212")) === "+14255551212", "digits");
assert(e164(normalizeNanpNationalInput("425-555-1212")) === "+14255551212", "hyphens");
assert(e164(normalizeNanpNationalInput("(425) 555-1212")) === "+14255551212", "parens");
assert(e164(normalizeNanpNationalInput("425 555 1212")) === "+14255551212", "spaces");
assert(e164(normalizeNanpNationalInput("+14255551212")) === "+14255551212", "existing e164");
assert(
  "error" in normalizeNanpNationalInput("425555121"),
  "short",
);
assert(
  "error" in normalizeNanpNationalInput("42555512121"),
  "long",
);
assert("error" in normalizeNanpNationalInput("not-a-phone"), "malformed");
assert(formatNationalNanpDisplay("+14255551212") === "(425) 555-1212", "display stored e164");

const builtin = phoneEntryMode(BUILTIN_SMS_DIALING_REGIONS);
assert(builtin.kind === "national", "single dialing code hides selector");
assert(builtin.kind === "national" && builtin.dialingCode === NANP_DIALING_CODE, "plus one");
assert(distinctDialingCodes(BUILTIN_SMS_DIALING_REGIONS).length === 1, "one code");

const unitedKingdom: DialingRegion = {
  regionCode: "GB",
  displayName: "United Kingdom",
  isoCountryCode: "GB",
  dialingCode: "+44",
  enabled: true,
  providerReady: true,
  sortOrder: 40,
};
const multi = phoneEntryMode([...BUILTIN_SMS_DIALING_REGIONS, unitedKingdom]);
assert(multi.kind === "selector", "multiple codes show selector");
assert(
  multi.kind === "selector" &&
    multi.regions.some((region) => region.regionCode === "GB") &&
    !multi.regions.some((region) => region.regionCode === "XX"),
  "only enabled fixture regions",
);

const notReady: DialingRegion = {
  ...unitedKingdom,
  enabled: true,
  providerReady: false,
};
assert(
  phoneEntryMode([...BUILTIN_SMS_DIALING_REGIONS, notReady]).kind === "national",
  "enabled but not provider-ready stays hidden",
);
assert(
  !selectableDialingRegions([notReady]).some((region) => region.regionCode === "GB"),
  "not provider-ready is not selectable",
);

const disabledReady: DialingRegion = {
  ...unitedKingdom,
  enabled: false,
  providerReady: true,
};
assert(
  phoneEntryMode([...BUILTIN_SMS_DIALING_REGIONS, disabledReady]).kind === "national",
  "provider-ready but disabled stays hidden",
);
assert(
  !selectableDialingRegions([disabledReady]).some(
    (region) => region.regionCode === "GB",
  ),
  "disabled region is not selectable",
);

const us = BUILTIN_SMS_DIALING_REGIONS[0];
assert(
  e164(
    normalizeSelectedRegionInput({ nationalNumber: "4255551212", region: us }),
  ) === "+14255551212",
  "selected plus one region",
);
assert(
  "error" in
    normalizeSelectedRegionInput({
      nationalNumber: "2079460958",
      region: unitedKingdom,
    }),
  "non plus one is not naively prepended",
);

assert(
  SMS_REGION_MANAGE_PERMISSION === "system.sms.manage_regions",
  "region admin is not the SMS test permission",
);
assert(isPlatformPermissionKey("system.sms.test"), "sms test permission remains");
assert(isPlatformPermissionKey(SMS_REGION_MANAGE_PERMISSION), "platform permission");
const superAdmin = resolvePermissionsFromRoleKeys([PLATFORM_ROLE_KEYS.SUPER_ADMIN]);
const developer = resolvePermissionsFromRoleKeys([PLATFORM_ROLE_KEYS.DEVELOPER]);
assert(hasPermissionInSet(superAdmin, SMS_REGION_MANAGE_PERMISSION), "super admin manages regions");
assert(hasPermissionInSet(developer, "system.sms.test"), "developer keeps SMS test");
assert(
  !hasPermissionInSet(developer, SMS_REGION_MANAGE_PERMISSION),
  "SMS test does not grant region administration",
);
assert(!isPlatformRoleKey("owner"), "organization owner is not platform admin");
assert(!isPlatformRoleKey("administrator"), "organization administrator is not platform admin");
assert(!isPlatformRoleKey("viewer"), "viewer is not platform admin");

console.log("phone entry selfcheck passed");
