"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getOperationalChurchContext } from "@/lib/church/auth";
import {
  buildInvitationUrl,
  canInviteMembers,
  generateInvitationToken,
  getAppOrigin,
  hashInvitationToken,
  isAllowedInviteRole,
  type InviteActionState,
  validateInviteForm,
} from "@/lib/church/invitations";
import { AuditAction, AuditEntityType } from "@/lib/audit/actions";
import { getRequestIpAddress, writeAuditLog } from "@/lib/audit/log";
import { sendChurchInvitationEmail } from "@/lib/church/send-invitation-email";

export async function createChurchInvitation(
  _prev: InviteActionState,
  formData: FormData,
): Promise<InviteActionState> {
  const validation = validateInviteForm(formData);
  if (validation.fieldErrors || !validation.data) {
    return { fieldErrors: validation.fieldErrors };
  }

  const input = validation.data;

  try {
    const { supabase, user, church, membership } =
      await getOperationalChurchContext();

    if (!canInviteMembers(membership.role)) {
      return { error: "You do not have permission to invite members." };
    }

    if (!isAllowedInviteRole(membership.role, input.role)) {
      return {
        error: "You are not allowed to invite someone with that role.",
        fieldErrors: { role: "That role is not available for your account." },
      };
    }

    const { data: emailTaken, error: emailCheckError } = await supabase.rpc(
      "church_has_active_member_email",
      {
        p_church_id: church.id,
        p_email: input.email,
      },
    );

    if (!emailCheckError && emailTaken === true) {
      return {
        error: "That email already has an active membership at this church.",
        fieldErrors: { email: "This person is already an active member." },
      };
    }

    const { data: pendingInvite } = await supabase
      .from("church_invitations")
      .select("id")
      .eq("church_id", church.id)
      .ilike("email", input.email)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .maybeSingle();

    if (pendingInvite) {
      return {
        error: "An active invitation already exists for this email.",
        fieldErrors: { email: "A pending invitation already exists." },
      };
    }

    const token = generateInvitationToken();
    const tokenHash = hashInvitationToken(token);
    const expiresAt = new Date();
    expiresAt.setUTCDate(expiresAt.getUTCDate() + input.expiresInDays);

    const { data: invitation, error: insertError } = await supabase
      .from("church_invitations")
      .insert({
        church_id: church.id,
        email: input.email,
        role: input.role,
        token_hash: tokenHash,
        invited_by: user.id,
        expires_at: expiresAt.toISOString(),
      })
      .select("id")
      .single();

    if (insertError || !invitation) {
      if (insertError?.code === "23505") {
        return {
          error: "An active invitation already exists for this email.",
          fieldErrors: { email: "A pending invitation already exists." },
        };
      }
      return {
        error: insertError?.message || "Unable to create the invitation.",
      };
    }

    const headerStore = await headers();
    const host = headerStore.get("x-forwarded-host") || headerStore.get("host");
    const proto = headerStore.get("x-forwarded-proto") || "http";
    const origin = host ? `${proto}://${host}` : getAppOrigin();
    const invitationUrl = buildInvitationUrl(origin, token);

    const { data: inviterProfile } = await supabase
      .from("profiles")
      .select("full_name, first_name, last_name")
      .eq("id", user.id)
      .maybeSingle();
    const invitedByName =
      inviterProfile?.full_name ||
      [inviterProfile?.first_name, inviterProfile?.last_name]
        .filter(Boolean)
        .join(" ") ||
      null;

    const emailResult = await sendChurchInvitationEmail({
      toEmail: input.email,
      churchName: church.name,
      role: input.role,
      invitationUrl,
      expiresAt: expiresAt.toISOString(),
      invitedByName,
    });

    await writeAuditLog(supabase, {
      churchId: church.id,
      userId: user.id,
      action: AuditAction.MEMBER_INVITED,
      entityType: AuditEntityType.CHURCH_INVITATION,
      entityId: invitation.id,
      metadata: {
        email: input.email,
        role: input.role,
        expires_at: expiresAt.toISOString(),
        expires_in_days: input.expiresInDays,
        email_sent: emailResult.sent,
        email_error: emailResult.error ?? null,
        provider_message_id: emailResult.providerMessageId ?? null,
      },
      ipAddress: await getRequestIpAddress(),
    });

    revalidatePath("/team");
    revalidatePath("/team/invite");

    return {
      success: true,
      invitationId: invitation.id,
      invitationUrl,
      emailSent: emailResult.sent,
      emailError: emailResult.error ?? null,
    };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to create the invitation.",
    };
  }
}

const RESEND_EXPIRATION_DAYS = 14;

export async function resendChurchInvitation(
  _prev: InviteActionState,
  formData: FormData,
): Promise<InviteActionState> {
  const invitationId = String(formData.get("invitation_id") ?? "").trim();
  if (!invitationId) {
    return { error: "Missing invitation." };
  }

  try {
    const { supabase, user, church, membership } =
      await getOperationalChurchContext();

    if (!canInviteMembers(membership.role)) {
      return { error: "You do not have permission to resend invitations." };
    }

    const { data: invite, error: loadError } = await supabase
      .from("church_invitations")
      .select("id, email, role, accepted_at, revoked_at, expires_at")
      .eq("id", invitationId)
      .eq("church_id", church.id)
      .maybeSingle();

    if (loadError || !invite) {
      return { error: "Invitation not found." };
    }
    if (invite.accepted_at) {
      return { error: "This invitation was already accepted." };
    }
    if (invite.revoked_at) {
      return { error: "This invitation was already revoked." };
    }
    if (new Date(invite.expires_at).getTime() <= Date.now()) {
      return { error: "This invitation has expired. Create a new one instead." };
    }

    if (!isAllowedInviteRole(membership.role, invite.role)) {
      return {
        error: "You are not allowed to resend an invitation for that role.",
      };
    }

    const token = generateInvitationToken();
    const tokenHash = hashInvitationToken(token);
    const expiresAt = new Date();
    expiresAt.setUTCDate(expiresAt.getUTCDate() + RESEND_EXPIRATION_DAYS);

    const { error: updateError } = await supabase
      .from("church_invitations")
      .update({
        token_hash: tokenHash,
        expires_at: expiresAt.toISOString(),
      })
      .eq("id", invitationId)
      .eq("church_id", church.id)
      .is("accepted_at", null)
      .is("revoked_at", null);

    if (updateError) {
      return { error: updateError.message };
    }

    const headerStore = await headers();
    const host = headerStore.get("x-forwarded-host") || headerStore.get("host");
    const proto = headerStore.get("x-forwarded-proto") || "http";
    const origin = host ? `${proto}://${host}` : getAppOrigin();
    const invitationUrl = buildInvitationUrl(origin, token);

    const { data: inviterProfile } = await supabase
      .from("profiles")
      .select("full_name, first_name, last_name")
      .eq("id", user.id)
      .maybeSingle();
    const invitedByName =
      inviterProfile?.full_name ||
      [inviterProfile?.first_name, inviterProfile?.last_name]
        .filter(Boolean)
        .join(" ") ||
      null;

    const emailResult = await sendChurchInvitationEmail({
      toEmail: String(invite.email),
      churchName: church.name,
      role: String(invite.role),
      invitationUrl,
      expiresAt: expiresAt.toISOString(),
      invitedByName,
    });

    await writeAuditLog(supabase, {
      churchId: church.id,
      userId: user.id,
      action: AuditAction.INVITATION_RESENT,
      entityType: AuditEntityType.CHURCH_INVITATION,
      entityId: invitationId,
      metadata: {
        email: invite.email,
        role: invite.role,
        expires_at: expiresAt.toISOString(),
        expires_in_days: RESEND_EXPIRATION_DAYS,
        email_sent: emailResult.sent,
        email_error: emailResult.error ?? null,
        provider_message_id: emailResult.providerMessageId ?? null,
      },
      ipAddress: await getRequestIpAddress(),
    });

    revalidatePath("/team");
    revalidatePath("/team/invite");

    return {
      success: true,
      invitationId,
      invitationUrl,
      emailSent: emailResult.sent,
      emailError: emailResult.error ?? null,
    };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to resend the invitation.",
    };
  }
}

export async function revokeChurchInvitation(
  _prev: InviteActionState,
  formData: FormData,
): Promise<InviteActionState> {
  const invitationId = String(formData.get("invitation_id") ?? "").trim();
  if (!invitationId) {
    return { error: "Missing invitation." };
  }

  try {
    const { supabase, user, church, membership } =
      await getOperationalChurchContext();

    if (!canInviteMembers(membership.role)) {
      return { error: "You do not have permission to revoke invitations." };
    }

    const { data: invite, error: loadError } = await supabase
      .from("church_invitations")
      .select("id, email, role, accepted_at, revoked_at")
      .eq("id", invitationId)
      .eq("church_id", church.id)
      .maybeSingle();

    if (loadError || !invite) {
      return { error: "Invitation not found." };
    }
    if (invite.accepted_at) {
      return { error: "This invitation was already accepted." };
    }
    if (invite.revoked_at) {
      return { error: "This invitation was already revoked." };
    }

    const revokedAt = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("church_invitations")
      .update({ revoked_at: revokedAt })
      .eq("id", invitationId)
      .eq("church_id", church.id);

    if (updateError) {
      return { error: updateError.message };
    }

    await writeAuditLog(supabase, {
      churchId: church.id,
      userId: user.id,
      action: AuditAction.INVITATION_REVOKED,
      entityType: AuditEntityType.CHURCH_INVITATION,
      entityId: invitationId,
      metadata: {
        email: invite.email,
        role: invite.role,
      },
      ipAddress: await getRequestIpAddress(),
    });

    revalidatePath("/team");
    revalidatePath("/team/invite");
    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to revoke the invitation.",
    };
  }
}
