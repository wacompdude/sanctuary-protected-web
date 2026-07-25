import { AuditAction, AuditEntityType } from "@/lib/audit/actions";
import { writePlatformAdminAction } from "@/lib/platform/audit";
import type { PlatformContext } from "@/lib/platform/types";
import { sendPlatformInvitationEmail } from "@/lib/platform/invitation-email";
import {
  buildPlatformInvitationUrl,
  generatePlatformInvitationToken,
  getPlatformInviteAppOrigin,
  hashPlatformInvitationToken,
  type PlatformInviteFormData,
  type PlatformInvitationRecord,
} from "@/lib/platform/invitations";
import { requirePlatformAdminClient } from "@/lib/platform/queries";
import { isPlatformRoleKey } from "@/lib/platform/role-keys";

function mapInvitation(row: Record<string, unknown>): PlatformInvitationRecord {
  const roleKeys = Array.isArray(row.role_keys)
    ? row.role_keys.map((value) => String(value))
    : [];
  return {
    id: String(row.id),
    email: String(row.email),
    display_name: (row.display_name as string | null) ?? null,
    account_type: row.account_type as PlatformInvitationRecord["account_type"],
    role_keys: roleKeys,
    status: String(row.status),
    expires_at: String(row.expires_at),
    invitation_note: (row.invitation_note as string | null) ?? null,
    created_at: (row.created_at as string | null) ?? null,
  };
}

export async function createPlatformInvitation(options: {
  context: PlatformContext;
  data: PlatformInviteFormData;
}): Promise<{
  invitation: PlatformInvitationRecord;
  invitationUrl: string;
  emailSent: boolean;
  emailError: string | null;
}> {
  const admin = requirePlatformAdminClient();
  const token = generatePlatformInvitationToken();
  const tokenHash = hashPlatformInvitationToken(token);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + options.data.expiresInDays);

  // Revoke any existing pending invite for this email (replace).
  await admin
    .from("platform_account_invitations")
    .update({
      status: "revoked",
      revoked_at: new Date().toISOString(),
      revoked_by: options.context.user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("status", "pending")
    .ilike("email", options.data.email);

  const { data: existingAccount } = await admin
    .from("platform_accounts")
    .select("id, status")
    .ilike("email_snapshot", options.data.email)
    .maybeSingle();

  if (existingAccount && existingAccount.status === "active") {
    throw new Error(
      "That email already has an active platform account. Manage roles on the account instead.",
    );
  }

  const { data: inserted, error } = await admin
    .from("platform_account_invitations")
    .insert({
      email: options.data.email,
      display_name: options.data.displayName || null,
      account_type: options.data.accountType,
      role_keys: options.data.roleKeys,
      token_hash: tokenHash,
      status: "pending",
      expires_at: expiresAt.toISOString(),
      invited_by: options.context.user.id,
      invited_by_platform_account_id: options.context.account.id,
      invitation_note: options.data.invitationNote || null,
    })
    .select(
      "id, email, display_name, account_type, role_keys, status, expires_at, invitation_note, created_at",
    )
    .single();

  if (error || !inserted) {
    throw new Error(error?.message || "Unable to create platform invitation.");
  }

  const invitation = mapInvitation(inserted as Record<string, unknown>);
  const invitationUrl = buildPlatformInvitationUrl(
    getPlatformInviteAppOrigin(),
    token,
  );

  const emailResult = await sendPlatformInvitationEmail({
    toEmail: invitation.email,
    displayName: invitation.display_name,
    roleKeys: invitation.role_keys,
    invitationUrl,
    expiresAt: invitation.expires_at,
    invitedByName:
      options.context.account.display_name ||
      options.context.account.email_snapshot,
    invitationNote: invitation.invitation_note,
  });

  await writePlatformAdminAction(
    {
      platformAccountId: options.context.account.id,
      actorUserId: options.context.user.id,
      action: AuditAction.PLATFORM_ACCOUNT_INVITED,
      targetType: AuditEntityType.PLATFORM_INVITATION,
      targetId: invitation.id,
      reason: options.data.invitationNote || "Platform account invitation",
      metadata: {
        email_snapshot: invitation.email,
        account_type: invitation.account_type,
        role_keys: invitation.role_keys,
        expires_at: invitation.expires_at,
        email_sent: emailResult.sent,
        require_mfa: options.data.requireMfa,
        // Never store raw token.
      },
    },
    { client: admin },
  );

  return {
    invitation,
    invitationUrl,
    emailSent: emailResult.sent,
    emailError: emailResult.error ?? null,
  };
}

export async function revokePlatformInvitation(options: {
  context: PlatformContext;
  invitationId: string;
  reason?: string;
}): Promise<void> {
  const admin = requirePlatformAdminClient();
  const { data: invite, error: loadError } = await admin
    .from("platform_account_invitations")
    .select("id, status, email")
    .eq("id", options.invitationId)
    .maybeSingle();

  if (loadError || !invite) {
    throw new Error(loadError?.message || "Invitation not found.");
  }
  if (invite.status !== "pending") {
    throw new Error("Only pending invitations can be revoked.");
  }

  const { error } = await admin
    .from("platform_account_invitations")
    .update({
      status: "revoked",
      revoked_at: new Date().toISOString(),
      revoked_by: options.context.user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", options.invitationId);

  if (error) {
    throw new Error(error.message || "Unable to revoke invitation.");
  }

  await writePlatformAdminAction(
    {
      platformAccountId: options.context.account.id,
      actorUserId: options.context.user.id,
      action: AuditAction.PLATFORM_ACCOUNT_UPDATED,
      targetType: AuditEntityType.PLATFORM_INVITATION,
      targetId: options.invitationId,
      reason: options.reason || "Platform invitation revoked",
      metadata: {
        email_snapshot: invite.email,
        invitation_status: "revoked",
      },
    },
    { client: admin },
  );
}

export async function listPendingPlatformInvitations(): Promise<
  PlatformInvitationRecord[]
> {
  const admin = requirePlatformAdminClient();
  const { data, error } = await admin
    .from("platform_account_invitations")
    .select(
      "id, email, display_name, account_type, role_keys, status, expires_at, invitation_note, created_at",
    )
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    throw new Error(error.message || "Unable to list invitations.");
  }

  return (data ?? []).map((row) => mapInvitation(row as Record<string, unknown>));
}

export async function getPlatformInvitationByToken(
  token: string,
): Promise<PlatformInvitationRecord | null> {
  const admin = requirePlatformAdminClient();
  const tokenHash = hashPlatformInvitationToken(token);
  const { data, error } = await admin
    .from("platform_account_invitations")
    .select(
      "id, email, display_name, account_type, role_keys, status, expires_at, invitation_note, created_at",
    )
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Unable to load invitation.");
  }
  if (!data) return null;

  const invitation = mapInvitation(data as Record<string, unknown>);
  if (invitation.status === "pending") {
    const expired = new Date(invitation.expires_at).getTime() < Date.now();
    if (expired) {
      await admin
        .from("platform_account_invitations")
        .update({
          status: "expired",
          updated_at: new Date().toISOString(),
        })
        .eq("id", invitation.id)
        .eq("status", "pending");
      return { ...invitation, status: "expired" };
    }
  }
  return invitation;
}

/**
 * Accept invitation: create Auth user (if needed), platform account, roles.
 * Caller supplies password only for new Auth users. Never logs password.
 */
export async function acceptPlatformInvitation(options: {
  token: string;
  password?: string;
  existingUserId?: string;
}): Promise<{
  userId: string;
  platformAccountId: string;
  email: string;
  createdAuthUser: boolean;
}> {
  const admin = requirePlatformAdminClient();
  const invitation = await getPlatformInvitationByToken(options.token);
  if (!invitation) {
    throw new Error("Invitation not found.");
  }
  if (invitation.status !== "pending") {
    throw new Error(`This invitation is ${invitation.status}.`);
  }
  if (new Date(invitation.expires_at).getTime() < Date.now()) {
    throw new Error("This invitation has expired.");
  }

  const roleKeys = invitation.role_keys.filter(isPlatformRoleKey);
  if (roleKeys.length === 0) {
    throw new Error("Invitation has no valid platform roles.");
  }

  let userId = options.existingUserId ?? null;
  let createdAuthUser = false;

  if (!userId) {
    if (!options.password) {
      throw new Error("Password is required to create your platform login.");
    }

    const { data: created, error: createError } =
      await admin.auth.admin.createUser({
        email: invitation.email,
        password: options.password,
        email_confirm: true,
        user_metadata: {
          full_name: invitation.display_name || invitation.email,
        },
      });

    if (createError || !created.user) {
      const message = createError?.message || "Unable to create login.";
      if (/already|registered|exists/i.test(message)) {
        throw new Error(
          "An account with this email already exists. Sign in with that account, then open the invitation link again.",
        );
      }
      throw new Error(message);
    }

    userId = created.user.id;
    createdAuthUser = true;
  } else {
    const { data: authUser, error: authError } =
      await admin.auth.admin.getUserById(userId);
    if (authError || !authUser.user) {
      throw new Error("Unable to verify your signed-in account.");
    }
    const signedInEmail = (authUser.user.email || "").trim().toLowerCase();
    if (signedInEmail !== invitation.email) {
      throw new Error(
        "Sign in with the email address this invitation was sent to.",
      );
    }
  }

  await admin.from("profiles").upsert(
    {
      id: userId,
      full_name: invitation.display_name || invitation.email,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );

  const { data: existingPlatform } = await admin
    .from("platform_accounts")
    .select("id, status")
    .eq("user_id", userId)
    .maybeSingle();

  let platformAccountId: string;
  if (existingPlatform?.id) {
    platformAccountId = String(existingPlatform.id);
    await admin
      .from("platform_accounts")
      .update({
        email_snapshot: invitation.email,
        display_name: invitation.display_name,
        account_type: invitation.account_type,
        status: "active",
        must_change_password: false,
        mfa_required: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", platformAccountId);
  } else {
    const { data: inserted, error: insertError } = await admin
      .from("platform_accounts")
      .insert({
        user_id: userId,
        email_snapshot: invitation.email,
        display_name: invitation.display_name,
        account_type: invitation.account_type,
        status: "active",
        must_change_password: false,
        mfa_required: true,
      })
      .select("id")
      .single();

    if (insertError || !inserted) {
      throw new Error(
        insertError?.message || "Unable to create platform account.",
      );
    }
    platformAccountId = String(inserted.id);
  }

  const { data: roles } = await admin
    .from("platform_roles")
    .select("id, role_key")
    .in("role_key", roleKeys)
    .eq("status", "active");

  for (const role of roles ?? []) {
    const { data: existingAssignment } = await admin
      .from("platform_account_roles")
      .select("id")
      .eq("platform_account_id", platformAccountId)
      .eq("platform_role_id", role.id)
      .is("revoked_at", null)
      .maybeSingle();
    if (existingAssignment) continue;

    const { error: assignError } = await admin
      .from("platform_account_roles")
      .insert({
        platform_account_id: platformAccountId,
        platform_role_id: role.id,
      });
    if (assignError) {
      throw new Error(
        `Unable to assign role ${role.role_key}: ${assignError.message}`,
      );
    }
  }

  const { error: acceptError } = await admin
    .from("platform_account_invitations")
    .update({
      status: "accepted",
      accepted_at: new Date().toISOString(),
      accepted_by_user_id: userId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", invitation.id)
    .eq("status", "pending");

  if (acceptError) {
    throw new Error(acceptError.message || "Unable to mark invitation accepted.");
  }

  await writePlatformAdminAction(
    {
      platformAccountId,
      actorUserId: userId,
      action: AuditAction.PLATFORM_ACCOUNT_CREATED,
      targetType: AuditEntityType.PLATFORM_ACCOUNT,
      targetId: platformAccountId,
      reason: "Accepted platform invitation",
      metadata: {
        invitation_id: invitation.id,
        email_snapshot: invitation.email,
        role_keys: roleKeys,
        created_auth_user: createdAuthUser,
        mfa_required: true,
      },
    },
    { client: admin },
  );

  return {
    userId,
    platformAccountId,
    email: invitation.email,
    createdAuthUser,
  };
}
