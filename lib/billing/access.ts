import type { MembershipRole } from "@/lib/organization/types";
import {
  requireOrganizationRole,
  type ActiveOrganizationContext,
} from "@/lib/organization/context";
import {
  BILLING_MANAGE_PERMISSIONS,
  BILLING_READ_PERMISSIONS,
  PERMISSION_KEYS,
  ROLE_PERMISSION_MAPPING,
  type PermissionKey,
} from "@/lib/security/permission-keys";

const BILLING_VIEW_ROLES: MembershipRole[] = [
  "owner",
  "co_owner",
  "administrator",
];

const BILLING_MANAGE_ROLES: MembershipRole[] = ["owner", "co_owner"];

function roleHasPermission(
  role: MembershipRole,
  permissionKey: PermissionKey,
): boolean {
  const mapped = ROLE_PERMISSION_MAPPING[role] ?? [];
  return mapped.includes(permissionKey);
}

/** True when the membership role may view org billing (read surfaces). */
export function canViewOrganizationBilling(role: MembershipRole): boolean {
  return (
    BILLING_VIEW_ROLES.includes(role) &&
    BILLING_READ_PERMISSIONS.every((key) => roleHasPermission(role, key))
  );
}

/** True when the membership role may perform billing management actions. */
export function canManageOrganizationBilling(role: MembershipRole): boolean {
  return (
    BILLING_MANAGE_ROLES.includes(role) &&
    BILLING_MANAGE_PERMISSIONS.every((key) => roleHasPermission(role, key))
  );
}

/** Gate for Billing page and other read surfaces. */
export async function requireBillingViewAccess(): Promise<
  ActiveOrganizationContext & { canManageBilling: boolean }
> {
  const context = await requireOrganizationRole(BILLING_VIEW_ROLES);
  if (!canViewOrganizationBilling(context.membership.role)) {
    const { ChurchAccessError } = await import("@/lib/organization/errors");
    throw new ChurchAccessError(
      "You do not have permission to view billing.",
      "FORBIDDEN_ROLE",
    );
  }
  return {
    ...context,
    canManageBilling: canManageOrganizationBilling(context.membership.role),
  };
}

/** Gate for Checkout, portal, plan change, cancel, SMS purchase controls. */
export async function requireBillingManageAccess(): Promise<ActiveOrganizationContext> {
  const context = await requireOrganizationRole(BILLING_MANAGE_ROLES);
  if (!canManageOrganizationBilling(context.membership.role)) {
    const { ChurchAccessError } = await import("@/lib/organization/errors");
    throw new ChurchAccessError(
      "You do not have permission to manage billing.",
      "FORBIDDEN_ROLE",
    );
  }
  return context;
}

export const BILLING_VIEW_PERMISSION_KEYS = BILLING_READ_PERMISSIONS;
export const BILLING_MANAGE_PERMISSION_KEYS = BILLING_MANAGE_PERMISSIONS;
export { PERMISSION_KEYS };
