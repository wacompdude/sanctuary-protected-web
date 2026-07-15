import { randomBytes } from "crypto";
import {
  normalizeInviteEmail,
  type InvitableRole,
  isAllowedInviteRole,
} from "@/lib/church/invitations";
import {
  MIN_PASSWORD_LENGTH,
  validateEmail,
  validatePassword,
} from "@/lib/auth/validation";
import type { ActionState, MembershipRole } from "@/lib/church/types";

export type ProvisionMemberActionState = ActionState & {
  /** Shown once after a new (or password-reset) account is provisioned. */
  credentials?: {
    email: string;
    password: string;
    accountCreated: boolean;
    passwordReset: boolean;
  };
  membershipId?: string;
};

export type ProvisionMemberInput = {
  email: string;
  firstName: string;
  lastName: string;
  role: InvitableRole;
  password: string;
  resetExistingPassword: boolean;
};

export function generateTemporaryPassword(length = 16): string {
  const alphabet =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const bytes = randomBytes(length);
  let result = "";
  for (let i = 0; i < length; i += 1) {
    result += alphabet[bytes[i]! % alphabet.length];
  }
  return result;
}

export function validateProvisionMemberForm(
  formData: FormData,
  actorRole: MembershipRole,
): {
  fieldErrors?: Record<string, string>;
  data?: ProvisionMemberInput;
} {
  const emailRaw = String(formData.get("email") ?? "");
  const firstName = String(formData.get("first_name") ?? "").trim();
  const lastName = String(formData.get("last_name") ?? "").trim();
  const roleRaw = String(formData.get("role") ?? "").trim();
  const passwordMode = String(formData.get("password_mode") ?? "generate").trim();
  const passwordRaw = String(formData.get("password") ?? "");
  const resetExistingPassword =
    String(formData.get("reset_existing_password") ?? "") === "on" ||
    String(formData.get("reset_existing_password") ?? "") === "true";

  const fieldErrors: Record<string, string> = {};

  const emailError = validateEmail(emailRaw);
  if (emailError) fieldErrors.email = emailError;

  if (!firstName) fieldErrors.first_name = "First name is required.";
  if (!lastName) fieldErrors.last_name = "Last name is required.";

  if (!isAllowedInviteRole(actorRole, roleRaw)) {
    fieldErrors.role = "That role is not available for your account.";
  }

  let password = passwordRaw;
  if (passwordMode === "generate") {
    password = generateTemporaryPassword();
  } else {
    const passwordError = validatePassword(passwordRaw);
    if (passwordError) fieldErrors.password = passwordError;
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors };
  }

  return {
    data: {
      email: normalizeInviteEmail(emailRaw),
      firstName,
      lastName,
      role: roleRaw as InvitableRole,
      password,
      resetExistingPassword,
    },
  };
}

export { MIN_PASSWORD_LENGTH };
