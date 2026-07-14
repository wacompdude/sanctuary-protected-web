import type { ChurchStatus, MembershipRole } from "@/lib/church/types";
import type { ChurchAppPreferences } from "@/lib/church/settings";
import { DEFAULT_APP_PREFERENCES } from "@/lib/church/settings";

/** Churches in these statuses cannot perform ordinary operational work. */
export function isChurchOperationallyLocked(
  status: ChurchStatus | string | null | undefined,
): boolean {
  return status === "suspended" || status === "closed";
}

export function isUsableOrOwnerRecoveryStatus(
  status: string | null | undefined,
  role: MembershipRole,
): boolean {
  if (!status || status === "trial" || status === "active") return true;
  if (
    (status === "suspended" || status === "closed") &&
    role === "owner"
  ) {
    return true;
  }
  return false;
}

/** Routes still available when the active church is suspended/closed (owner recovery). */
export const CHURCH_RECOVERY_PATH_PREFIXES = [
  "/settings/church",
  "/settings/account",
  "/settings/ownership",
  "/settings/billing",
  "/profile",
  "/select-church",
  "/home",
] as const;

export function isChurchRecoveryPath(pathname: string): boolean {
  return CHURCH_RECOVERY_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function resolveChurchLandingPath(
  preferences?: Partial<ChurchAppPreferences> | null,
): string {
  const page =
    preferences?.default_dashboard_page ??
    DEFAULT_APP_PREFERENCES.default_dashboard_page;
  if (
    page === "/dashboard" ||
    page === "/incidents" ||
    page === "/team" ||
    page === "/certifications"
  ) {
    return page;
  }
  return "/dashboard";
}

/**
 * Feature toggles are stored for future use but are not active product features.
 * Always return false until the corresponding subsystem ships.
 */
export function isStoredFeatureActive(
  feature:
    | "push_notifications"
    | "sms_notifications"
    | "iot_sensors"
    | "camera_integration",
): boolean {
  void feature;
  return false;
}
