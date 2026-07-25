export const PLATFORM_ROLE_KEYS = {
  SUPER_ADMIN: "super_admin",
  PLATFORM_ADMIN: "platform_admin",
  DEVELOPER: "developer",
  SUPPORT: "support",
  BILLING_ADMIN: "billing_admin",
  AUDITOR: "auditor",
} as const;

export type PlatformRoleKey =
  (typeof PLATFORM_ROLE_KEYS)[keyof typeof PLATFORM_ROLE_KEYS];

export const PLATFORM_ROLE_KEY_LIST: readonly PlatformRoleKey[] = Object.values(
  PLATFORM_ROLE_KEYS,
);

export const PLATFORM_ROLE_DISPLAY_NAMES: Record<PlatformRoleKey, string> = {
  [PLATFORM_ROLE_KEYS.SUPER_ADMIN]: "Super Administrator",
  [PLATFORM_ROLE_KEYS.PLATFORM_ADMIN]: "Platform Administrator",
  [PLATFORM_ROLE_KEYS.DEVELOPER]: "Platform Developer",
  [PLATFORM_ROLE_KEYS.SUPPORT]: "Platform Support",
  [PLATFORM_ROLE_KEYS.BILLING_ADMIN]: "Platform Billing Administrator",
  [PLATFORM_ROLE_KEYS.AUDITOR]: "Platform Auditor",
};

export function isPlatformRoleKey(value: string): value is PlatformRoleKey {
  return (PLATFORM_ROLE_KEY_LIST as readonly string[]).includes(value);
}

/** Roles that may assign `super_admin` (enforced in app mutations). */
export function canManageSuperAdminRole(actorRoleKeys: readonly string[]): boolean {
  return actorRoleKeys.includes(PLATFORM_ROLE_KEYS.SUPER_ADMIN);
}
