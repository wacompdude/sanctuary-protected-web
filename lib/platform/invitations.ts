import { createHash, randomBytes } from "crypto";
import { getPublicAppOrigin } from "@/lib/auth/app-origin";
import { validateEmail } from "@/lib/auth/validation";
import {
  PLATFORM_BOOTSTRAP_MIN_PASSWORD_LENGTH,
} from "@/lib/platform/bootstrap";
import {
  PLATFORM_ROLE_DISPLAY_NAMES,
  PLATFORM_ROLE_KEYS,
  isPlatformRoleKey,
  type PlatformRoleKey,
} from "@/lib/platform/role-keys";
import type { PlatformAccountType } from "@/lib/platform/types";

export const PLATFORM_INVITE_EXPIRATION_OPTIONS = [
  { value: "7", label: "7 days" },
  { value: "14", label: "14 days" },
  { value: "30", label: "30 days" },
] as const;

export type PlatformInviteExpirationDays = 7 | 14 | 30;

export const PLATFORM_ACCOUNT_TYPE_OPTIONS: Array<{
  value: PlatformAccountType;
  label: string;
}> = [
  { value: "developer", label: "Developer" },
  { value: "support", label: "Support" },
  { value: "billing", label: "Billing" },
  { value: "audit", label: "Audit" },
  { value: "internal", label: "Internal" },
];

const DEFAULT_INVITABLE_ROLES: PlatformRoleKey[] = [
  PLATFORM_ROLE_KEYS.DEVELOPER,
  PLATFORM_ROLE_KEYS.SUPPORT,
  PLATFORM_ROLE_KEYS.BILLING_ADMIN,
  PLATFORM_ROLE_KEYS.AUDITOR,
  PLATFORM_ROLE_KEYS.PLATFORM_ADMIN,
];

export function normalizePlatformInviteEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function generatePlatformInvitationToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashPlatformInvitationToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function buildPlatformInvitationUrl(origin: string, token: string): string {
  const base = origin.replace(/\/$/, "");
  return `${base}/platform/invitations/accept?token=${encodeURIComponent(token)}`;
}

export function getPlatformInviteAppOrigin(): string {
  return getPublicAppOrigin();
}

/**
 * Roles the actor may assign on invite.
 * Super-admin role requires platform.super_admin.manage.
 */
export function platformRolesInviterMayAssign(
  permissions: ReadonlySet<string>,
): PlatformRoleKey[] {
  if (
    !permissions.has("platform.accounts.create") &&
    !permissions.has("platform.roles.assign")
  ) {
    return [];
  }

  const roles = [...DEFAULT_INVITABLE_ROLES];
  if (permissions.has("platform.super_admin.manage")) {
    roles.push(PLATFORM_ROLE_KEYS.SUPER_ADMIN);
  }
  return roles;
}

export function isAllowedPlatformInviteRole(
  permissions: ReadonlySet<string>,
  roleKey: string,
): roleKey is PlatformRoleKey {
  return platformRolesInviterMayAssign(permissions).includes(
    roleKey as PlatformRoleKey,
  );
}

export function labelForPlatformRoleKey(roleKey: string): string {
  if (isPlatformRoleKey(roleKey)) {
    return PLATFORM_ROLE_DISPLAY_NAMES[roleKey];
  }
  return roleKey;
}

export type PlatformInviteFormData = {
  email: string;
  displayName: string;
  accountType: PlatformAccountType;
  roleKeys: PlatformRoleKey[];
  expiresInDays: PlatformInviteExpirationDays;
  invitationNote: string;
  requireMfa: boolean;
};

export type PlatformInviteActionState = {
  error?: string | null;
  success?: boolean;
  fieldErrors?: Record<string, string>;
  invitationId?: string;
  invitationUrl?: string;
  emailSent?: boolean;
  emailError?: string | null;
};

export function validatePlatformInviteForm(
  formData: FormData,
  permissions: ReadonlySet<string>,
): {
  fieldErrors?: Record<string, string>;
  data?: PlatformInviteFormData;
} {
  const fieldErrors: Record<string, string> = {};
  const emailRaw = String(formData.get("email") ?? "");
  const emailError = validateEmail(emailRaw);
  if (emailError) fieldErrors.email = emailError;

  const displayName = String(formData.get("display_name") ?? "").trim();
  const accountTypeRaw = String(formData.get("account_type") ?? "developer");
  const accountType = PLATFORM_ACCOUNT_TYPE_OPTIONS.some(
    (item) => item.value === accountTypeRaw,
  )
    ? (accountTypeRaw as PlatformAccountType)
    : null;
  if (!accountType) {
    fieldErrors.account_type = "Select a valid account type.";
  }

  const roleKeys = formData
    .getAll("role_keys")
    .map((value) => String(value))
    .filter(Boolean);
  if (roleKeys.length === 0) {
    fieldErrors.role_keys = "Select at least one platform role.";
  } else {
    for (const key of roleKeys) {
      if (!isAllowedPlatformInviteRole(permissions, key)) {
        fieldErrors.role_keys = `You are not allowed to assign role: ${key}.`;
        break;
      }
    }
  }

  const expiresRaw = String(formData.get("expires_in_days") ?? "14");
  const expiresInDays = Number(expiresRaw) as PlatformInviteExpirationDays;
  if (![7, 14, 30].includes(expiresInDays)) {
    fieldErrors.expires_in_days = "Select a valid expiration.";
  }

  const invitationNote = String(formData.get("invitation_note") ?? "").trim();
  const requireMfa = formData.get("require_mfa") !== "false";

  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors };
  }

  return {
    data: {
      email: normalizePlatformInviteEmail(emailRaw),
      displayName,
      accountType: accountType!,
      roleKeys: roleKeys as PlatformRoleKey[],
      expiresInDays,
      invitationNote,
      requireMfa,
    },
  };
}

export function validatePlatformAcceptPasswordForm(formData: FormData): {
  fieldErrors?: Record<string, string>;
  data?: { password: string };
} {
  const fieldErrors: Record<string, string> = {};
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm_password") ?? "");

  if (!password) {
    fieldErrors.password = "Password is required.";
  } else if (password.length < PLATFORM_BOOTSTRAP_MIN_PASSWORD_LENGTH) {
    fieldErrors.password = `Password must be at least ${PLATFORM_BOOTSTRAP_MIN_PASSWORD_LENGTH} characters.`;
  } else if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    fieldErrors.password =
      "Password must include at least one letter and one number.";
  }

  if (!confirm) {
    fieldErrors.confirm_password = "Confirm your password.";
  } else if (password !== confirm) {
    fieldErrors.confirm_password = "Passwords do not match.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors };
  }

  return { data: { password } };
}

export type PlatformInvitationRecord = {
  id: string;
  email: string;
  display_name: string | null;
  account_type: PlatformAccountType;
  role_keys: string[];
  status: string;
  expires_at: string;
  invitation_note: string | null;
  created_at: string | null;
};
