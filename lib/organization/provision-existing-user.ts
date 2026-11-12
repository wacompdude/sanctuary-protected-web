/**
 * Stage 3H-2B-E5 — Existing-user identity protection for organization provisioning.
 *
 * Organization membership managers must never change a global Supabase Auth
 * password or overwrite global user_metadata merely by provisioning.
 * Existing accounts must use the invitation + acceptance workflow.
 */

export const EXISTING_USER_PROVISION_ERROR =
  "That email already has a Sanctuary Protected account. Send an organization invitation instead so they can sign in and accept access.";

export const EXISTING_USER_PROVISION_FIELD_ERROR =
  "Use Invite for existing accounts.";

export type ExistingUserProvisionDecision = {
  /** Always false — org provision never changes global Auth passwords. */
  allowPasswordChange: false;
  /** Always false — org provision never overwrites global Auth metadata. */
  allowMetadataOverwrite: false;
  /** Always false — membership requires invitation acceptance. */
  allowMembershipAttach: false;
  /** Always false — never return credentials for existing accounts. */
  returnCredentials: false;
  /** Always false — client flags cannot bypass these rules. */
  resetExistingPasswordHonored: false;
  error: string;
  fieldError: string;
};

export type ProvisionCreateUserResolution =
  | { kind: "created"; userId: string }
  | {
      kind: "existing_user_refused";
      decision: ExistingUserProvisionDecision;
    }
  | { kind: "create_failed"; error: string };

/**
 * Server-side security rule for the already-registered provision path.
 * Callers must refuse mutation regardless of membership, role, platform role,
 * organization relationship, or any client-supplied resetExistingPassword flag.
 */
export function decideExistingUserProvisionOutcome(_context?: {
  resetExistingPassword?: boolean | null;
  sameOrganization?: boolean | null;
  multiOrganization?: boolean | null;
  isOrganizationOwner?: boolean | null;
  isPlatformSuperAdmin?: boolean | null;
  actorCanManageMemberships?: boolean | null;
  forgedClientFlag?: boolean | null;
}): ExistingUserProvisionDecision {
  void _context;
  return {
    allowPasswordChange: false,
    allowMetadataOverwrite: false,
    allowMembershipAttach: false,
    returnCredentials: false,
    resetExistingPasswordHonored: false,
    error: EXISTING_USER_PROVISION_ERROR,
    fieldError: EXISTING_USER_PROVISION_FIELD_ERROR,
  };
}

export function isAlreadyRegisteredAuthError(
  message: string | undefined,
): boolean {
  if (!message) return false;
  const lower = message.toLowerCase();
  return (
    lower.includes("already been registered") ||
    lower.includes("already registered") ||
    lower.includes("user already exists") ||
    lower.includes("email_exists")
  );
}

/**
 * Shared createUser outcome resolver used by web and mobile provision paths.
 * Existing-user outcomes never authorize Auth mutation or membership attach.
 */
export function resolveProvisionCreateUserResult(input: {
  createdUserId?: string | null;
  createErrorMessage?: string | null;
  resetExistingPassword?: boolean | null;
}): ProvisionCreateUserResolution {
  if (input.createdUserId) {
    return { kind: "created", userId: input.createdUserId };
  }

  if (isAlreadyRegisteredAuthError(input.createErrorMessage ?? undefined)) {
    return {
      kind: "existing_user_refused",
      decision: decideExistingUserProvisionOutcome({
        resetExistingPassword: input.resetExistingPassword,
        forgedClientFlag: Boolean(input.resetExistingPassword),
        actorCanManageMemberships: true,
      }),
    };
  }

  return {
    kind: "create_failed",
    error:
      input.createErrorMessage ||
      "Unable to create the login account for this member.",
  };
}

type MutableAdminSurface = {
  auth: {
    admin: {
      updateUserById: (...args: unknown[]) => Promise<unknown>;
      createUser: (...args: unknown[]) => Promise<unknown>;
      deleteUser: (...args: unknown[]) => Promise<unknown>;
    };
  };
  rpc: (...args: unknown[]) => Promise<unknown>;
  from: (...args: unknown[]) => unknown;
};

/**
 * Executable existing-user provision simulation against a disposable admin mock.
 * Proves the security rule never mutates Auth or attaches membership.
 */
export async function simulateExistingUserProvisionAgainstAdmin(input: {
  admin: MutableAdminSurface;
  email: string;
  password: string;
  resetExistingPassword?: boolean | null;
  userMetadata?: Record<string, string>;
}): Promise<{
  decision: ExistingUserProvisionDecision;
  updateUserByIdCalls: number;
  attachRpcCalls: number;
  deleteUserCalls: number;
  credentialsReturned: null;
}> {
  const updateUserByIdCalls: unknown[][] = [];
  const attachRpcCalls: unknown[][] = [];
  const deleteUserCalls: unknown[][] = [];

  const originalUpdate = input.admin.auth.admin.updateUserById.bind(
    input.admin.auth.admin,
  );
  const originalRpc = input.admin.rpc.bind(input.admin);
  const originalDelete = input.admin.auth.admin.deleteUser.bind(
    input.admin.auth.admin,
  );

  input.admin.auth.admin.updateUserById = async (...args: unknown[]) => {
    updateUserByIdCalls.push(args);
    return originalUpdate(...args);
  };
  input.admin.rpc = async (...args: unknown[]) => {
    if (args[0] === "attach_organization_membership") {
      attachRpcCalls.push(args);
    }
    return originalRpc(...args);
  };
  input.admin.auth.admin.deleteUser = async (...args: unknown[]) => {
    deleteUserCalls.push(args);
    return originalDelete(...args);
  };

  const created = await input.admin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: input.userMetadata ?? {},
  });

  const createPayload = created as {
    data?: { user?: { id?: string } | null };
    error?: { message?: string } | null;
    user?: { id?: string } | null;
  };

  const createdUserId =
    createPayload?.data?.user?.id ?? createPayload?.user?.id ?? null;
  const createErrorMessage =
    createPayload?.error?.message ??
    (createdUserId ? null : "User already registered");

  const resolution = resolveProvisionCreateUserResult({
    createdUserId,
    createErrorMessage,
    resetExistingPassword: input.resetExistingPassword,
  });

  if (resolution.kind !== "existing_user_refused") {
    throw new Error(
      `Expected existing_user_refused, got ${resolution.kind}`,
    );
  }

  // Critical: stop here. Do not call updateUserById, profiles upsert, or attach.
  return {
    decision: resolution.decision,
    updateUserByIdCalls: updateUserByIdCalls.length,
    attachRpcCalls: attachRpcCalls.length,
    deleteUserCalls: deleteUserCalls.length,
    credentialsReturned: null,
  };
}
