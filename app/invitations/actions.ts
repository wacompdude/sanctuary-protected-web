"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isNextControlFlowError } from "@/lib/organization/access-guard";
import { writeActiveChurchCookie } from "@/lib/organization/cookie";
import { setActiveChurchForUser } from "@/lib/organization/context";
import {
  hashInvitationToken,
  type InviteActionState,
} from "@/lib/organization/invitations";
import {
  createAdminClient,
  isServiceRoleConfigured,
} from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  entitlementErrorMessage,
  requireActiveSeatCapacity,
} from "@/lib/subscriptions/enforcement";

async function enterAcceptedChurch(organizationId: string | null): Promise<never> {
  if (organizationId) {
    try {
      await setActiveChurchForUser(organizationId);
    } catch {
      await writeActiveChurchCookie(organizationId);
    }
  }

  revalidatePath("/", "layout");
  redirect("/home");
}

export async function acceptChurchInvitation(
  _prev: InviteActionState,
  formData: FormData,
): Promise<InviteActionState> {
  const token = String(formData.get("token") ?? "").trim();
  if (!token) {
    return { error: "Missing invitation token." };
  }

  const nextPath = `/invitations/accept?token=${encodeURIComponent(token)}`;

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect(`/login?next=${encodeURIComponent(nextPath)}`);
    }

    if (isServiceRoleConfigured()) {
      const admin = createAdminClient();
      const tokenHash = hashInvitationToken(token);
      const { data: invitation } = await admin
        .from("organization_invitations")
        .select("organization_id, accepted_at, revoked_at, expires_at")
        .eq("token_hash", tokenHash)
        .maybeSingle();

      if (
        invitation?.organization_id &&
        !invitation.accepted_at &&
        !invitation.revoked_at &&
        (!invitation.expires_at ||
          new Date(invitation.expires_at).getTime() >= Date.now())
      ) {
        const organizationId = String(invitation.organization_id);
        const { data: existingMembership } = await admin
          .from("organization_memberships")
          .select("id, status")
          .eq("organization_id", organizationId)
          .eq("user_id", user.id)
          .maybeSingle();

        if (existingMembership?.status !== "active") {
          await requireActiveSeatCapacity({
            organizationId,
            client: admin,
          });
        }
      }
    }

    const { data, error } = await supabase.rpc("accept_organization_invitation", {
      p_token: token,
    });

    if (error) {
      const message = error.message || "Unable to accept this invitation.";
      if (message.includes("EMAIL_MISMATCH")) {
        return {
          error:
            "Sign in with the email address this invitation was sent to. A different account cannot accept it.",
        };
      }
      if (message.includes("EXPIRED")) {
        return { error: "This invitation has expired." };
      }
      if (message.includes("REVOKED")) {
        return { error: "This invitation has been revoked." };
      }
      if (message.includes("ACCEPTED")) {
        if (isServiceRoleConfigured()) {
          const admin = createAdminClient();
          const tokenHash = hashInvitationToken(token);
          const { data: invitation } = await admin
            .from("organization_invitations")
            .select("organization_id")
            .eq("token_hash", tokenHash)
            .maybeSingle();
          if (invitation?.organization_id) {
            const { data: membership } = await admin
              .from("organization_memberships")
              .select("id")
              .eq("organization_id", invitation.organization_id)
              .eq("user_id", user.id)
              .eq("status", "active")
              .maybeSingle();
            if (membership) {
              await enterAcceptedChurch(String(invitation.organization_id));
            }
          }
        }
        return { error: "This invitation has already been accepted." };
      }
      if (message.includes("NOT_FOUND")) {
        return { error: "Invitation not found." };
      }
      if (message.includes("UNAUTHENTICATED")) {
        redirect(`/login?next=${encodeURIComponent(nextPath)}`);
      }
      if (
        /function\s+[\w.]+\s*\([^)]*\)\s+does not exist/i.test(message) &&
        message.includes("accept_organization_invitation")
      ) {
        return {
          error:
            "Invitation acceptance is not configured yet. Run supabase/migrations/014_accept_church_invitation.sql in the Supabase SQL Editor.",
        };
      }
      return { error: message };
    }

    const organizationId =
      data && typeof data === "object" && "organization_id" in data
        ? String((data as { organization_id: string }).organization_id)
        : null;

    return enterAcceptedChurch(organizationId);
  } catch (error) {
    if (isNextControlFlowError(error)) throw error;
    const entitlementMessage = entitlementErrorMessage(error);
    if (entitlementMessage) return { error: entitlementMessage };
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to accept this invitation. Please try again.",
    };
  }
}
