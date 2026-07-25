import { MIN_PASSWORD_LENGTH, validateEmail } from "@/lib/auth/validation";
import { AuditAction, AuditEntityType } from "@/lib/audit/actions";
import { PLATFORM_ROLE_KEYS } from "@/lib/platform/role-keys";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Only these emails may be used with the bootstrap script. */
export const APPROVED_SUPER_ADMIN_BOOTSTRAP_EMAILS = [
  "repus_admin@sanctuaryprotected.com",
] as const;

export const PLATFORM_BOOTSTRAP_MIN_PASSWORD_LENGTH = Math.max(
  MIN_PASSWORD_LENGTH,
  12,
);

export type BootstrapEnvInput = {
  enabled: string | undefined;
  email: string | undefined;
  password: string | undefined;
  supabaseUrl: string | undefined;
  serviceRoleKey: string | undefined;
};

export type BootstrapEnvValidation =
  | { ok: true; email: string; password: string }
  | { ok: false; error: string };

export type BootstrapResult = {
  email: string;
  authUserCreated: boolean;
  authUserExisted: boolean;
  platformAccountCreated: boolean;
  platformAccountExisted: boolean;
  roleAssigned: boolean;
  roleAlreadyAssigned: boolean;
  passwordWasSetOnCreate: boolean;
  auditWritten: boolean;
  platformAccountId: string;
  userId: string;
  mustChangePassword: boolean;
  mfaRequired: boolean;
  reminder: string;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isApprovedBootstrapEmail(email: string): boolean {
  const normalized = normalizeEmail(email);
  return (APPROVED_SUPER_ADMIN_BOOTSTRAP_EMAILS as readonly string[]).includes(
    normalized,
  );
}

export function isBootstrapExplicitlyEnabled(value: string | undefined): boolean {
  return String(value ?? "").trim().toLowerCase() === "true";
}

/**
 * Validate bootstrap env without echoing the password.
 * Callers must never log `password`.
 */
export function validateBootstrapEnv(
  input: BootstrapEnvInput,
): BootstrapEnvValidation {
  if (!isBootstrapExplicitlyEnabled(input.enabled)) {
    return {
      ok: false,
      error:
        "Bootstrap is disabled. Set SUPER_ADMIN_BOOTSTRAP_ENABLED=true only for a one-time run.",
    };
  }

  const emailRaw = String(input.email ?? "").trim();
  if (!emailRaw) {
    return {
      ok: false,
      error: "SUPER_ADMIN_BOOTSTRAP_EMAIL is required.",
    };
  }

  const emailError = validateEmail(emailRaw);
  if (emailError) {
    return { ok: false, error: `SUPER_ADMIN_BOOTSTRAP_EMAIL: ${emailError}` };
  }

  const email = normalizeEmail(emailRaw);
  if (!isApprovedBootstrapEmail(email)) {
    return {
      ok: false,
      error:
        "SUPER_ADMIN_BOOTSTRAP_EMAIL is not an approved bootstrap address.",
    };
  }

  const password = String(input.password ?? "");
  if (!password) {
    return {
      ok: false,
      error: "SUPER_ADMIN_BOOTSTRAP_PASSWORD is required.",
    };
  }

  if (password.length < PLATFORM_BOOTSTRAP_MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      error: `SUPER_ADMIN_BOOTSTRAP_PASSWORD must be at least ${PLATFORM_BOOTSTRAP_MIN_PASSWORD_LENGTH} characters.`,
    };
  }

  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return {
      ok: false,
      error:
        "SUPER_ADMIN_BOOTSTRAP_PASSWORD must include at least one letter and one number.",
    };
  }

  if (!String(input.supabaseUrl ?? "").trim()) {
    return {
      ok: false,
      error: "NEXT_PUBLIC_SUPABASE_URL is required.",
    };
  }

  if (!String(input.serviceRoleKey ?? "").trim()) {
    return {
      ok: false,
      error: "SUPABASE_SERVICE_ROLE_KEY is required.",
    };
  }

  return { ok: true, email, password };
}

function isAlreadyRegisteredError(message: string | undefined): boolean {
  if (!message) return false;
  const lower = message.toLowerCase();
  return (
    lower.includes("already been registered") ||
    lower.includes("already registered") ||
    lower.includes("user already exists") ||
    lower.includes("email_exists")
  );
}

export function assertBootstrapCliOnly(): void {
  if (process.env.SUPER_ADMIN_BOOTSTRAP_CLI !== "1") {
    throw new Error(
      "Bootstrap may only run via npm run bootstrap:super-admin (server CLI).",
    );
  }
  if (typeof window !== "undefined") {
    throw new Error("Bootstrap cannot run in the browser.");
  }
}

/**
 * Idempotent super-admin bootstrap.
 * Never logs, returns, or persists the password in application tables.
 * Does not reset the password when the Auth user already exists.
 */
export async function bootstrapSuperAdmin(options: {
  admin: SupabaseClient;
  email: string;
  password: string;
}): Promise<BootstrapResult> {
  assertBootstrapCliOnly();

  const email = normalizeEmail(options.email);
  if (!isApprovedBootstrapEmail(email)) {
    throw new Error("Bootstrap email is not approved.");
  }

  let userId: string | null = null;
  let authUserCreated = false;
  let authUserExisted = false;
  let passwordWasSetOnCreate = false;

  const { data: created, error: createError } =
    await options.admin.auth.admin.createUser({
      email,
      password: options.password,
      email_confirm: true,
      user_metadata: {
        full_name: "Platform Super Administrator",
        bootstrap: true,
      },
      app_metadata: {
        // Hint only — authoritative access is platform_accounts + roles.
        platform_bootstrap: true,
      },
    });

  if (createError || !created.user) {
    if (!isAlreadyRegisteredError(createError?.message)) {
      throw new Error(
        createError?.message || "Unable to create the Auth user for bootstrap.",
      );
    }

    const { data: existingUserId, error: lookupError } = await options.admin.rpc(
      "get_auth_user_id_by_email",
      { p_email: email },
    );

    if (lookupError || !existingUserId) {
      throw new Error(
        lookupError?.message ||
          "Auth user already exists but could not be looked up. Ensure get_auth_user_id_by_email is available.",
      );
    }

    userId = String(existingUserId);
    authUserExisted = true;
    // Spec: do not reset password automatically for existing users.
  } else {
    userId = created.user.id;
    authUserCreated = true;
    passwordWasSetOnCreate = true;
  }

  if (!userId) {
    throw new Error("Bootstrap failed: Auth user id missing.");
  }

  await options.admin.from("profiles").upsert(
    {
      id: userId,
      full_name: "Platform Super Administrator",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );

  const { data: existingAccount, error: accountLookupError } = await options.admin
    .from("platform_accounts")
    .select(
      "id, user_id, status, must_change_password, mfa_required, email_snapshot",
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (accountLookupError) {
    throw new Error(
      `Unable to load platform account: ${accountLookupError.message}. Apply migration 044_platform_administration.sql.`,
    );
  }

  let platformAccountId: string;
  let platformAccountCreated = false;
  let platformAccountExisted = false;

  if (existingAccount?.id) {
    platformAccountId = String(existingAccount.id);
    platformAccountExisted = true;
    // Existing account: do not reset password flags or wipe MFA state on re-run.
  } else {
    const { data: inserted, error: insertError } = await options.admin
      .from("platform_accounts")
      .insert({
        user_id: userId,
        email_snapshot: email,
        display_name: "Platform Super Administrator",
        status: "active",
        account_type: "internal",
        must_change_password: true,
        mfa_required: true,
      })
      .select("id")
      .single();

    if (insertError || !inserted?.id) {
      throw new Error(
        insertError?.message || "Unable to create platform account.",
      );
    }

    platformAccountId = String(inserted.id);
    platformAccountCreated = true;
  }

  const { data: superAdminRole, error: roleError } = await options.admin
    .from("platform_roles")
    .select("id, role_key")
    .eq("role_key", PLATFORM_ROLE_KEYS.SUPER_ADMIN)
    .maybeSingle();

  if (roleError || !superAdminRole?.id) {
    throw new Error(
      roleError?.message ||
        "super_admin platform role is missing. Apply migration 044_platform_administration.sql.",
    );
  }

  const { data: existingAssignment, error: assignmentLookupError } =
    await options.admin
      .from("platform_account_roles")
      .select("id, revoked_at")
      .eq("platform_account_id", platformAccountId)
      .eq("platform_role_id", superAdminRole.id)
      .is("revoked_at", null)
      .maybeSingle();

  if (assignmentLookupError) {
    throw new Error(
      `Unable to load role assignments: ${assignmentLookupError.message}`,
    );
  }

  let roleAssigned = false;
  let roleAlreadyAssigned = false;

  if (existingAssignment?.id) {
    roleAlreadyAssigned = true;
  } else {
    const { error: assignError } = await options.admin
      .from("platform_account_roles")
      .insert({
        platform_account_id: platformAccountId,
        platform_role_id: superAdminRole.id,
      });

    if (assignError) {
      throw new Error(
        `Unable to assign super_admin role: ${assignError.message}`,
      );
    }
    roleAssigned = true;
  }

  const shouldAudit =
    authUserCreated ||
    platformAccountCreated ||
    roleAssigned;

  let auditWritten = false;
  if (shouldAudit) {
    const { error: auditError } = await options.admin
      .from("platform_admin_actions")
      .insert({
        platform_account_id: platformAccountId,
        actor_user_id: userId,
        action: AuditAction.PLATFORM_BOOTSTRAP_SUPER_ADMIN_CREATED,
        target_type: AuditEntityType.PLATFORM_ACCOUNT,
        target_id: platformAccountId,
        reason: "Secure one-time platform super admin bootstrap",
        success: true,
        metadata: {
          email_snapshot: email,
          auth_user_created: authUserCreated,
          auth_user_existed: authUserExisted,
          platform_account_created: platformAccountCreated,
          platform_account_existed: platformAccountExisted,
          role_assigned: roleAssigned,
          role_already_assigned: roleAlreadyAssigned,
          password_set_on_create: passwordWasSetOnCreate,
          must_change_password: true,
          mfa_required: true,
          // Never include password or raw tokens.
        },
      });

    if (auditError) {
      throw new Error(`Bootstrap audit write failed: ${auditError.message}`);
    }
    auditWritten = true;
  }

  const mustChangePassword = platformAccountCreated
    ? true
    : Boolean(existingAccount?.must_change_password);
  const mfaRequired = platformAccountCreated
    ? true
    : existingAccount?.mfa_required !== false;

  return {
    email,
    authUserCreated,
    authUserExisted,
    platformAccountCreated,
    platformAccountExisted,
    roleAssigned,
    roleAlreadyAssigned,
    passwordWasSetOnCreate,
    auditWritten,
    platformAccountId,
    userId,
    mustChangePassword,
    mfaRequired,
    reminder:
      "Disable bootstrap now: set SUPER_ADMIN_BOOTSTRAP_ENABLED=false and clear SUPER_ADMIN_BOOTSTRAP_PASSWORD from the environment. Sign in, change the password, then enroll MFA before using the console.",
  };
}
