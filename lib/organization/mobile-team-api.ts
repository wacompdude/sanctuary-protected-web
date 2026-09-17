import { validateEmail, validatePassword } from "@/lib/auth/validation";
import { AuditAction, AuditEntityType } from "@/lib/audit/actions";
import { writeAuditLog } from "@/lib/audit/log";
import { getMobileAuthContext } from "@/lib/mfa/mobile-api";
import {
  buildInvitationUrl,
  canInviteMembers,
  generateInvitationToken,
  getAppOrigin,
  hashInvitationToken,
  isAllowedInviteRole,
  normalizeInviteEmail,
  rolesInviterMayAssign,
  type InviteExpirationDays,
} from "@/lib/organization/invitations";
import {
  generateTemporaryPassword,
  type ProvisionMemberInput,
} from "@/lib/organization/provision-member";
import { sendChurchInvitationEmail } from "@/lib/organization/send-invitation-email";
import {
  canChangeRole,
  canChangeStatus,
  canEditMemberProfile,
  canManageTeamMemberships,
  parseMembershipRoleSafe,
  parseMembershipStatus,
} from "@/lib/organization/team";
import {
  isUsableOrganizationStatus,
  normalizeMembershipRole,
  type MembershipRole,
} from "@/lib/organization/types";
import {
  entitlementErrorMessage,
  requireActiveSeatCapacity,
} from "@/lib/subscriptions/enforcement";
import {
  createAdminClient,
  isServiceRoleConfigured,
} from "@/lib/supabase/admin";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export function mobileTeamCorsHeaders() {
  return CORS_HEADERS;
}

type MembershipContext = {
  organizationId: string;
  organizationName: string;
  role: MembershipRole;
};

type AuthFailure =
  | { status: "unauthenticated"; error: string }
  | { status: "forbidden"; error: string };

export type MobileTeamResponse =
  | AuthFailure
  | { status: "error"; error: string; fieldErrors?: Record<string, string> }
  | { status: "ok"; [key: string]: unknown };

async function loadMembershipContext(
  userId: string,
  organizationId: string,
): Promise<MembershipContext | { error: string }> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("organization_memberships")
    .select("role, status")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (error || !data) {
    return { error: "You do not have access to this organization." };
  }

  const { data: organization } = await admin
    .from("organizations")
    .select("name, display_name, status")
    .eq("id", organizationId)
    .maybeSingle();

  if (!isUsableOrganizationStatus(organization?.status)) {
    return { error: "This organization is not active." };
  }

  return {
    organizationId,
    organizationName:
      organization?.display_name || organization?.name || "Organization",
    role: normalizeMembershipRole(String(data.role)),
  };
}

async function requireTeamActor(
  request: Request,
  organizationId: string | null,
): Promise<
  | { error: AuthFailure; status: number }
  | { userId: string; email: string; membership: MembershipContext }
> {
  const ctx = await getMobileAuthContext(request);
  if (!ctx) {
    return {
      status: 401,
      error: {
        status: "unauthenticated",
        error: "Sign in with your email and password first.",
      },
    };
  }
  if (!organizationId?.trim()) {
    return {
      status: 400,
      error: { status: "forbidden", error: "organizationId is required." },
    };
  }
  const membership = await loadMembershipContext(ctx.userId, organizationId);
  if ("error" in membership) {
    return {
      status: 403,
      error: { status: "forbidden", error: membership.error },
    };
  }
  return { userId: ctx.userId, email: ctx.email, membership };
}

async function countActiveOwners(organizationId: string) {
  const admin = createAdminClient();
  const { count } = await admin
    .from("organization_memberships")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("role", "owner")
    .eq("status", "active");
  return count ?? 0;
}

export async function listMobilePendingInvitations(
  request: Request,
  organizationId: string | null,
): Promise<{ body: MobileTeamResponse; status: number }> {
  const auth = await requireTeamActor(request, organizationId);
  if ("error" in auth) return { body: auth.error, status: auth.status };
  if (!canInviteMembers(auth.membership.role)) {
    return {
      status: 403,
      body: {
        status: "forbidden",
        error: "You do not have permission to manage invitations.",
      },
    };
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("organization_invitations")
    .select("id, email, role, expires_at, created_at, invited_by")
    .eq("organization_id", auth.membership.organizationId)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });

  if (error) {
    return { status: 400, body: { status: "error", error: error.message } };
  }

  return {
    status: 200,
    body: {
      status: "ok",
      assignableRoles: rolesInviterMayAssign(auth.membership.role),
      invitations: (data ?? []).map((row) => ({
        id: String(row.id),
        email: String(row.email),
        role: String(row.role),
        expiresAt: row.expires_at as string,
        createdAt: row.created_at as string,
      })),
    },
  };
}

export async function createMobileInvitation(
  request: Request,
  input: {
    organizationId?: string | null;
    email?: string | null;
    role?: string | null;
    expiresInDays?: number | null;
  },
): Promise<{ body: MobileTeamResponse; status: number }> {
  const auth = await requireTeamActor(request, input.organizationId ?? null);
  if ("error" in auth) return { body: auth.error, status: auth.status };
  if (!canInviteMembers(auth.membership.role)) {
    return {
      status: 403,
      body: {
        status: "forbidden",
        error: "You do not have permission to invite members.",
      },
    };
  }

  const email = normalizeInviteEmail(String(input.email ?? ""));
  const role = String(input.role ?? "").trim();
  const expiresInDays = Number(
    input.expiresInDays ?? 14,
  ) as InviteExpirationDays;
  const fieldErrors: Record<string, string> = {};
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    fieldErrors.email = "Enter a valid email address.";
  }
  if (!isAllowedInviteRole(auth.membership.role, role)) {
    fieldErrors.role = "That role is not available for your account.";
  }
  if (![7, 14, 30].includes(expiresInDays)) {
    fieldErrors.expiresInDays = "Select 7, 14, or 30 days.";
  }
  if (Object.keys(fieldErrors).length > 0) {
    return {
      status: 400,
      body: { status: "error", error: "Check the form fields.", fieldErrors },
    };
  }

  const admin = createAdminClient();
  const { data: emailTaken } = await admin.rpc(
    "organization_has_active_member_email",
    {
      p_organization_id: auth.membership.organizationId,
      p_email: email,
    },
  );
  if (emailTaken === true) {
    return {
      status: 400,
      body: {
        status: "error",
        error: "That email already has an active membership at this church.",
        fieldErrors: { email: "This person is already an active member." },
      },
    };
  }

  const { data: pendingInvite } = await admin
    .from("organization_invitations")
    .select("id")
    .eq("organization_id", auth.membership.organizationId)
    .ilike("email", email)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .maybeSingle();
  if (pendingInvite) {
    return {
      status: 400,
      body: {
        status: "error",
        error: "An active invitation already exists for this email.",
        fieldErrors: { email: "A pending invitation already exists." },
      },
    };
  }

  try {
    await requireActiveSeatCapacity({
      organizationId: auth.membership.organizationId,
      client: admin,
    });
  } catch (error) {
    return {
      status: 400,
      body: {
        status: "error",
        error: entitlementErrorMessage(error) || "Seat capacity reached.",
      },
    };
  }

  const token = generateInvitationToken();
  const expiresAt = new Date();
  expiresAt.setUTCDate(expiresAt.getUTCDate() + expiresInDays);

  const { data: invitation, error: insertError } = await admin
    .from("organization_invitations")
    .insert({
      organization_id: auth.membership.organizationId,
      email,
      role,
      token_hash: hashInvitationToken(token),
      invited_by: auth.userId,
      expires_at: expiresAt.toISOString(),
    })
    .select("id")
    .single();

  if (insertError || !invitation) {
    return {
      status: 400,
      body: {
        status: "error",
        error: insertError?.message || "Unable to create the invitation.",
      },
    };
  }

  const invitationUrl = buildInvitationUrl(getAppOrigin(), token);
  const { data: inviterProfile } = await admin
    .from("profiles")
    .select("full_name, first_name, last_name")
    .eq("id", auth.userId)
    .maybeSingle();
  const invitedByName =
    inviterProfile?.full_name ||
    [inviterProfile?.first_name, inviterProfile?.last_name]
      .filter(Boolean)
      .join(" ") ||
    null;

  const emailResult = await sendChurchInvitationEmail({
    toEmail: email,
    churchName: auth.membership.organizationName,
    role,
    invitationUrl,
    expiresAt: expiresAt.toISOString(),
    invitedByName,
  });

  await writeAuditLog(admin, {
    organizationId: auth.membership.organizationId,
    userId: auth.userId,
    action: AuditAction.MEMBER_INVITED,
    entityType: AuditEntityType.CHURCH_INVITATION,
    entityId: invitation.id,
    metadata: {
      email,
      role,
      expires_at: expiresAt.toISOString(),
      email_sent: emailResult.sent,
      source: "mobile",
    },
  });

  return {
    status: 200,
    body: {
      status: "ok",
      invitationId: invitation.id,
      emailSent: emailResult.sent,
      emailError: emailResult.error ?? null,
    },
  };
}

export async function resendMobileInvitation(
  request: Request,
  input: { organizationId?: string | null; invitationId?: string | null },
): Promise<{ body: MobileTeamResponse; status: number }> {
  const auth = await requireTeamActor(request, input.organizationId ?? null);
  if ("error" in auth) return { body: auth.error, status: auth.status };
  if (!canInviteMembers(auth.membership.role)) {
    return {
      status: 403,
      body: {
        status: "forbidden",
        error: "You do not have permission to manage invitations.",
      },
    };
  }

  const invitationId = String(input.invitationId ?? "").trim();
  if (!invitationId) {
    return {
      status: 400,
      body: { status: "error", error: "invitationId is required." },
    };
  }

  const admin = createAdminClient();
  const { data: invitation } = await admin
    .from("organization_invitations")
    .select("id, email, role, accepted_at, revoked_at")
    .eq("id", invitationId)
    .eq("organization_id", auth.membership.organizationId)
    .maybeSingle();

  if (!invitation || invitation.accepted_at || invitation.revoked_at) {
    return {
      status: 404,
      body: { status: "error", error: "Invitation not found." },
    };
  }

  const token = generateInvitationToken();
  const expiresAt = new Date();
  expiresAt.setUTCDate(expiresAt.getUTCDate() + 14);
  const { error } = await admin
    .from("organization_invitations")
    .update({
      token_hash: hashInvitationToken(token),
      expires_at: expiresAt.toISOString(),
    })
    .eq("id", invitationId);

  if (error) {
    return { status: 400, body: { status: "error", error: error.message } };
  }

  const invitationUrl = buildInvitationUrl(getAppOrigin(), token);
  const emailResult = await sendChurchInvitationEmail({
    toEmail: String(invitation.email),
    churchName: auth.membership.organizationName,
    role: String(invitation.role),
    invitationUrl,
    expiresAt: expiresAt.toISOString(),
    invitedByName: null,
  });

  return {
    status: 200,
    body: {
      status: "ok",
      emailSent: emailResult.sent,
      emailError: emailResult.error ?? null,
    },
  };
}

export async function revokeMobileInvitation(
  request: Request,
  input: { organizationId?: string | null; invitationId?: string | null },
): Promise<{ body: MobileTeamResponse; status: number }> {
  const auth = await requireTeamActor(request, input.organizationId ?? null);
  if ("error" in auth) return { body: auth.error, status: auth.status };
  if (!canInviteMembers(auth.membership.role)) {
    return {
      status: 403,
      body: {
        status: "forbidden",
        error: "You do not have permission to manage invitations.",
      },
    };
  }

  const invitationId = String(input.invitationId ?? "").trim();
  if (!invitationId) {
    return {
      status: 400,
      body: { status: "error", error: "invitationId is required." },
    };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("organization_invitations")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", invitationId)
    .eq("organization_id", auth.membership.organizationId)
    .is("accepted_at", null)
    .is("revoked_at", null);

  if (error) {
    return { status: 400, body: { status: "error", error: error.message } };
  }

  return { status: 200, body: { status: "ok" } };
}

export async function provisionMobileMember(
  request: Request,
  input: {
    organizationId?: string | null;
    email?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    role?: string | null;
    passwordMode?: string | null;
    password?: string | null;
    resetExistingPassword?: boolean | null;
  },
): Promise<{ body: MobileTeamResponse; status: number }> {
  if (!isServiceRoleConfigured()) {
    return {
      status: 500,
      body: {
        status: "error",
        error:
          "Server is missing SUPABASE_SERVICE_ROLE_KEY. Add it to provision members.",
      },
    };
  }

  const auth = await requireTeamActor(request, input.organizationId ?? null);
  if ("error" in auth) return { body: auth.error, status: auth.status };
  if (!canInviteMembers(auth.membership.role)) {
    return {
      status: 403,
      body: {
        status: "forbidden",
        error: "You do not have permission to add members.",
      },
    };
  }

  const emailRaw = String(input.email ?? "");
  const firstName = String(input.firstName ?? "").trim();
  const lastName = String(input.lastName ?? "").trim();
  const role = String(input.role ?? "").trim();
  const passwordMode = String(input.passwordMode ?? "generate").trim();
  const resetExistingPassword = Boolean(input.resetExistingPassword);
  const fieldErrors: Record<string, string> = {};
  const emailError = validateEmail(emailRaw);
  if (emailError) fieldErrors.email = emailError;
  if (!firstName) fieldErrors.firstName = "First name is required.";
  if (!lastName) fieldErrors.lastName = "Last name is required.";
  if (!isAllowedInviteRole(auth.membership.role, role)) {
    fieldErrors.role = "That role is not available for your account.";
  }

  let password = String(input.password ?? "");
  if (passwordMode === "generate") {
    password = generateTemporaryPassword();
  } else {
    const passwordError = validatePassword(password);
    if (passwordError) fieldErrors.password = passwordError;
  }
  if (Object.keys(fieldErrors).length > 0) {
    return {
      status: 400,
      body: { status: "error", error: "Check the form fields.", fieldErrors },
    };
  }

  const email = normalizeInviteEmail(emailRaw);
  const provisionInput: ProvisionMemberInput = {
    email,
    firstName,
    lastName,
    role: role as ProvisionMemberInput["role"],
    password,
    resetExistingPassword,
  };

  const admin = createAdminClient();
  try {
    await requireActiveSeatCapacity({
      organizationId: auth.membership.organizationId,
      client: admin,
    });
  } catch (error) {
    return {
      status: 400,
      body: {
        status: "error",
        error: entitlementErrorMessage(error) || "Seat capacity reached.",
      },
    };
  }

  const { data: emailTaken } = await admin.rpc(
    "organization_has_active_member_email",
    {
      p_organization_id: auth.membership.organizationId,
      p_email: email,
    },
  );
  if (emailTaken === true) {
    return {
      status: 400,
      body: {
        status: "error",
        error: "That email already has an active membership at this church.",
        fieldErrors: { email: "This person is already an active member." },
      },
    };
  }

  let targetUserId: string | null = null;
  let accountCreated = false;
  let passwordReset = false;
  let provisionalPassword: string | null = provisionInput.password;
  const fullName = `${firstName} ${lastName}`.trim();
  const userMetadata = {
    first_name: firstName,
    last_name: lastName,
    full_name: fullName,
  };

  const { data: created, error: createError } =
    await admin.auth.admin.createUser({
      email,
      password: provisionInput.password,
      email_confirm: true,
      user_metadata: userMetadata,
    });

  if (createError || !created.user) {
    const message = (createError?.message ?? "").toLowerCase();
    const already =
      message.includes("already been registered") ||
      message.includes("already registered") ||
      message.includes("user already exists") ||
      message.includes("email_exists");
    if (!already) {
      return {
        status: 400,
        body: {
          status: "error",
          error:
            createError?.message ||
            "Unable to create the login account for this member.",
        },
      };
    }

    const { data: existingUserId, error: lookupError } = await admin.rpc(
      "get_auth_user_id_by_email",
      { p_email: email },
    );
    if (lookupError || !existingUserId) {
      return {
        status: 400,
        body: {
          status: "error",
          error:
            lookupError?.message ||
            "That email is already registered, but the account could not be looked up.",
        },
      };
    }
    targetUserId = String(existingUserId);
    provisionalPassword = null;
    if (resetExistingPassword) {
      const { error: updateError } = await admin.auth.admin.updateUserById(
        targetUserId,
        {
          password: provisionInput.password,
          email_confirm: true,
          user_metadata: userMetadata,
        },
      );
      if (updateError) {
        return {
          status: 400,
          body: { status: "error", error: updateError.message },
        };
      }
      provisionalPassword = provisionInput.password;
      passwordReset = true;
    } else {
      await admin.auth.admin.updateUserById(targetUserId, {
        user_metadata: userMetadata,
      });
    }
  } else {
    targetUserId = created.user.id;
    accountCreated = true;
  }

  await admin.from("profiles").upsert(
    {
      id: targetUserId,
      first_name: firstName,
      last_name: lastName,
      full_name: fullName,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );

  const { data: attachResult, error: attachError } = await admin.rpc(
    "attach_organization_membership",
    {
      p_organization_id: auth.membership.organizationId,
      p_user_id: targetUserId,
      p_role: role,
    },
  );

  if (attachError || !attachResult) {
    if (accountCreated && targetUserId) {
      await admin.auth.admin.deleteUser(targetUserId);
    }
    return {
      status: 400,
      body: {
        status: "error",
        error: attachError?.message || "Unable to attach church access.",
      },
    };
  }

  await writeAuditLog(admin, {
    organizationId: auth.membership.organizationId,
    userId: auth.userId,
    action: AuditAction.MEMBER_PROVISIONED,
    entityType: AuditEntityType.CHURCH_MEMBERSHIP,
    entityId: String(attachResult),
    metadata: {
      email,
      role,
      account_created: accountCreated,
      password_reset: passwordReset,
      source: "mobile",
    },
  });

  return {
    status: 200,
    body: {
      status: "ok",
      membershipId: String(attachResult),
      credentials:
        provisionalPassword != null
          ? {
              email,
              password: provisionalPassword,
              accountCreated,
              passwordReset,
            }
          : null,
    },
  };
}

export async function updateMobileMembershipRole(
  request: Request,
  input: {
    organizationId?: string | null;
    membershipId?: string | null;
    role?: string | null;
  },
): Promise<{ body: MobileTeamResponse; status: number }> {
  const auth = await requireTeamActor(request, input.organizationId ?? null);
  if ("error" in auth) return { body: auth.error, status: auth.status };
  if (!canManageTeamMemberships(auth.membership.role)) {
    return {
      status: 403,
      body: {
        status: "forbidden",
        error: "You do not have permission to manage memberships.",
      },
    };
  }

  const membershipId = String(input.membershipId ?? "").trim();
  const nextRole = parseMembershipRoleSafe(String(input.role ?? "").trim());
  if (!membershipId) {
    return {
      status: 400,
      body: { status: "error", error: "membershipId is required." },
    };
  }
  if (nextRole === "owner") {
    return {
      status: 400,
      body: {
        status: "error",
        error:
          "Use Ownership settings to transfer the primary owner role to a co-owner.",
      },
    };
  }

  const admin = createAdminClient();
  const { data: target } = await admin
    .from("organization_memberships")
    .select("id, user_id, role, status")
    .eq("id", membershipId)
    .eq("organization_id", auth.membership.organizationId)
    .maybeSingle();
  if (!target) {
    return {
      status: 404,
      body: { status: "error", error: "Member not found." },
    };
  }

  const targetRole = parseMembershipRoleSafe(String(target.role));
  const targetStatus = parseMembershipStatus(String(target.status));
  if (
    !canChangeRole({
      actorRole: auth.membership.role,
      actorUserId: auth.userId,
      targetUserId: String(target.user_id),
      targetRole,
      targetStatus,
      nextRole,
    })
  ) {
    return {
      status: 403,
      body: {
        status: "error",
        error: "You do not have permission to change this member's role.",
      },
    };
  }

  const { error } = await admin
    .from("organization_memberships")
    .update({ role: nextRole, updated_at: new Date().toISOString() })
    .eq("id", membershipId)
    .eq("organization_id", auth.membership.organizationId);
  if (error) {
    return { status: 400, body: { status: "error", error: error.message } };
  }

  await writeAuditLog(admin, {
    organizationId: auth.membership.organizationId,
    userId: auth.userId,
    action: AuditAction.MEMBERSHIP_ROLE_CHANGED,
    entityType: AuditEntityType.CHURCH_MEMBERSHIP,
    entityId: membershipId,
    metadata: {
      target_user_id: target.user_id,
      from_role: targetRole,
      to_role: nextRole,
      source: "mobile",
    },
  });

  return { status: 200, body: { status: "ok" } };
}

export async function updateMobileMembershipStatus(
  request: Request,
  input: {
    organizationId?: string | null;
    membershipId?: string | null;
    status?: string | null;
    confirmed?: boolean | null;
  },
): Promise<{ body: MobileTeamResponse; status: number }> {
  const auth = await requireTeamActor(request, input.organizationId ?? null);
  if ("error" in auth) return { body: auth.error, status: auth.status };
  if (!canManageTeamMemberships(auth.membership.role)) {
    return {
      status: 403,
      body: {
        status: "forbidden",
        error: "You do not have permission to manage memberships.",
      },
    };
  }

  const membershipId = String(input.membershipId ?? "").trim();
  const nextStatus = parseMembershipStatus(String(input.status ?? "").trim());
  if (!membershipId) {
    return {
      status: 400,
      body: { status: "error", error: "membershipId is required." },
    };
  }
  if (
    (nextStatus === "suspended" || nextStatus === "removed") &&
    !input.confirmed
  ) {
    return {
      status: 400,
      body: {
        status: "error",
        error: "Confirmation is required for this action.",
      },
    };
  }

  const admin = createAdminClient();
  const { data: target } = await admin
    .from("organization_memberships")
    .select("id, user_id, role, status")
    .eq("id", membershipId)
    .eq("organization_id", auth.membership.organizationId)
    .maybeSingle();
  if (!target) {
    return {
      status: 404,
      body: { status: "error", error: "Member not found." },
    };
  }

  const targetRole = parseMembershipRoleSafe(String(target.role));
  const targetStatus = parseMembershipStatus(String(target.status));
  const activeOwners = await countActiveOwners(auth.membership.organizationId);
  const isLastActiveOwner =
    targetRole === "owner" &&
    targetStatus === "active" &&
    activeOwners <= 1;

  if (
    !canChangeStatus({
      actorRole: auth.membership.role,
      actorUserId: auth.userId,
      targetUserId: String(target.user_id),
      targetRole,
      targetStatus,
      nextStatus,
      isLastActiveOwner,
    })
  ) {
    return {
      status: 403,
      body: {
        status: "error",
        error: isLastActiveOwner
          ? "Cannot suspend or remove the last active owner."
          : "You do not have permission to change this member's status.",
      },
    };
  }

  if (nextStatus === "active" && targetStatus !== "active") {
    try {
      await requireActiveSeatCapacity({
        organizationId: auth.membership.organizationId,
        client: admin,
      });
    } catch (error) {
      return {
        status: 400,
        body: {
          status: "error",
          error: entitlementErrorMessage(error) || "Seat capacity reached.",
        },
      };
    }
  }

  const { error } = await admin
    .from("organization_memberships")
    .update({ status: nextStatus, updated_at: new Date().toISOString() })
    .eq("id", membershipId)
    .eq("organization_id", auth.membership.organizationId);
  if (error) {
    return { status: 400, body: { status: "error", error: error.message } };
  }

  const statusAction =
    nextStatus === "suspended"
      ? AuditAction.MEMBERSHIP_SUSPENDED
      : nextStatus === "removed"
        ? AuditAction.MEMBERSHIP_REMOVED
        : AuditAction.MEMBERSHIP_REACTIVATED;

  await writeAuditLog(admin, {
    organizationId: auth.membership.organizationId,
    userId: auth.userId,
    action: statusAction,
    entityType: AuditEntityType.CHURCH_MEMBERSHIP,
    entityId: membershipId,
    metadata: {
      target_user_id: target.user_id,
      from_status: targetStatus,
      to_status: nextStatus,
      source: "mobile",
    },
  });

  return { status: 200, body: { status: "ok" } };
}

export async function updateMobileMemberProfile(
  request: Request,
  input: {
    organizationId?: string | null;
    userId?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    phone?: string | null;
  },
): Promise<{ body: MobileTeamResponse; status: number }> {
  const auth = await requireTeamActor(request, input.organizationId ?? null);
  if ("error" in auth) return { body: auth.error, status: auth.status };
  if (!canEditMemberProfile(auth.membership.role)) {
    return {
      status: 403,
      body: {
        status: "forbidden",
        error:
          "Only owners, co-owners, and administrators can update a member's name.",
      },
    };
  }

  const userId = String(input.userId ?? "").trim();
  if (!userId) {
    return {
      status: 400,
      body: { status: "error", error: "userId is required." },
    };
  }

  const admin = createAdminClient();
  const { data: target } = await admin
    .from("organization_memberships")
    .select("id")
    .eq("organization_id", auth.membership.organizationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!target) {
    return {
      status: 404,
      body: { status: "error", error: "Member not found." },
    };
  }

  const { error } = await admin.rpc("update_member_profile", {
    p_user_id: userId,
    p_first_name: String(input.firstName ?? "").trim(),
    p_last_name: String(input.lastName ?? "").trim(),
    p_phone: String(input.phone ?? "").trim(),
  });
  if (error) {
    return { status: 400, body: { status: "error", error: error.message } };
  }

  return { status: 200, body: { status: "ok" } };
}
