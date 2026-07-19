import { createHash, randomBytes } from "crypto";
import type { MembershipRole } from "@/lib/church/types";
import type { ActionState } from "@/lib/church/types";
import { isOwnershipRole } from "@/lib/church/types";

export const INVITE_EXPIRATION_OPTIONS = [
  { value: "7", label: "7 days" },
  { value: "14", label: "14 days" },
  { value: "30", label: "30 days" },
] as const;

export type InviteExpirationDays = 7 | 14 | 30;

export type InvitableRole = Exclude<MembershipRole, "owner">;

export const OWNERSHIP_INVITE_ROLES: InvitableRole[] = [
  "co_owner",
  "administrator",
  "security_leader",
  "security_member",
  "viewer",
];

export const OWNER_ADMIN_INVITE_ROLES: InvitableRole[] = [
  "administrator",
  "security_leader",
  "security_member",
  "viewer",
];

export const SECURITY_LEADER_INVITE_ROLES: InvitableRole[] = [
  "security_member",
  "viewer",
];

export function normalizeInviteEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function canInviteMembers(role: MembershipRole): boolean {
  return (
    isOwnershipRole(role) ||
    role === "administrator" ||
    role === "security_leader"
  );
}

export function rolesInviterMayAssign(role: MembershipRole): InvitableRole[] {
  if (isOwnershipRole(role)) {
    return OWNERSHIP_INVITE_ROLES;
  }
  if (role === "administrator") {
    return OWNER_ADMIN_INVITE_ROLES;
  }
  if (role === "security_leader") {
    return SECURITY_LEADER_INVITE_ROLES;
  }
  return [];
}

export function isAllowedInviteRole(
  inviterRole: MembershipRole,
  inviteRole: string,
): inviteRole is InvitableRole {
  return rolesInviterMayAssign(inviterRole).includes(
    inviteRole as InvitableRole,
  );
}

export function generateInvitationToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function buildInvitationUrl(origin: string, token: string): string {
  const base = origin.replace(/\/$/, "");
  return `${base}/invitations/accept?token=${encodeURIComponent(token)}`;
}

export function getAppOrigin(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL.replace(/\/$/, "")}`;
  }
  return "http://localhost:3000";
}

export type InviteActionState = ActionState & {
  invitationUrl?: string;
  invitationId?: string;
  emailSent?: boolean;
  emailError?: string | null;
};

export function validateInviteForm(formData: FormData): {
  fieldErrors?: Record<string, string>;
  data?: {
    email: string;
    role: InvitableRole;
    expiresInDays: InviteExpirationDays;
  };
} {
  const emailRaw = String(formData.get("email") ?? "");
  const roleRaw = String(formData.get("role") ?? "").trim();
  const expiresRaw = String(formData.get("expires_in_days") ?? "").trim();

  const fieldErrors: Record<string, string> = {};
  const email = normalizeInviteEmail(emailRaw);

  if (!email) {
    fieldErrors.email = "Email is required.";
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    fieldErrors.email = "Enter a valid email address.";
  }

  if (
    roleRaw !== "co_owner" &&
    roleRaw !== "administrator" &&
    roleRaw !== "security_leader" &&
    roleRaw !== "security_member" &&
    roleRaw !== "viewer"
  ) {
    fieldErrors.role = "Select a valid role.";
  }

  const expiresInDays = Number(expiresRaw) as InviteExpirationDays;
  if (![7, 14, 30].includes(expiresInDays)) {
    fieldErrors.expires_in_days = "Select an expiration period.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors };
  }

  return {
    data: {
      email,
      role: roleRaw as InvitableRole,
      expiresInDays,
    },
  };
}

export function labelForMembershipRole(role: string): string {
  switch (role) {
    case "owner":
      return "Owner";
    case "co_owner":
      return "Co-owner";
    case "administrator":
      return "Administrator";
    case "security_leader":
      return "Security leader";
    case "security_member":
      return "Security member";
    case "viewer":
      return "Viewer";
    default:
      return role;
  }
}
