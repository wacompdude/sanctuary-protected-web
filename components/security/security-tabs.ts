export const SECURITY_TABS = [
  "overview",
  "groups",
  "users",
  "permissions",
  "campus",
  "temporary",
  "audit",
  "settings",
] as const;

export type SecurityTabValue = (typeof SECURITY_TABS)[number];

export function isSecurityTab(value: string | null): value is SecurityTabValue {
  return Boolean(value && (SECURITY_TABS as readonly string[]).includes(value));
}

export function securityTabHref(tab: SecurityTabValue): string {
  if (tab === "overview") return "/settings/security";
  return `/settings/security?tab=${tab}`;
}
