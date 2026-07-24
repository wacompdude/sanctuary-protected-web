"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { writeActiveChurchCookie } from "@/lib/church/cookie";
import { setActiveChurchForUser } from "@/lib/church/context";
import {
  hashInvitationToken,
  type InviteActionState,
} from "@/lib/church/invitations";
import {
  createAdminClient,
  isServiceRoleConfigured,
} from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  entitlementErrorMessage,
  requireActiveSeatCapacity,
} from "@/lib/subscriptions/enforcement";

export async function acceptChurchInvitation(
  _prev: InviteActionState,
  formData: FormData,
): Promise<InviteActionState> {
  const token = String(formData.get("token") ?? "").trim();
  if (!token) {
    return { error: "Missing invitation token." };
  }

  const nextPath = `/invitations/accept?token=${encodeURIComponent(token)}`;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }

  if (isServiceRoleConfigured()) {
    try {
      const admin = createAdminClient();
      const tokenHash = hashInvitationToken(token);
      const { data: invitation } = await admin
        .from("church_invitations")
        .select("church_id, accepted_at, revoked_at, expires_at")
        .eq("token_hash", tokenHash)
        .maybeSingle();

      if (
        invitation?.church_id &&
        !invitation.accepted_at &&
        !invitation.revoked_at &&
        (!invitation.expires_at ||
          new Date(invitation.expires_at).getTime() >= Date.now())
      ) {
        await requireActiveSeatCapacity({
          churchId: String(invitation.church_id),
          client: admin,
        });
      }
    } catch (error) {
      const message = entitlementErrorMessage(error);
      if (message) return { error: message };
      throw error;
    }
  }

  const { data, error } = await supabase.rpc("accept_church_invitation", {
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
      message.includes("accept_church_invitation")
    ) {
      return {
        error:
          "Invitation acceptance is not configured yet. Run supabase/migrations/014_accept_church_invitation.sql in the Supabase SQL Editor.",
      };
    }
    return { error: message };
  }

  const churchId =
    data && typeof data === "object" && "church_id" in data
      ? String((data as { church_id: string }).church_id)
      : null;

  if (churchId) {
    try {
      await setActiveChurchForUser(churchId);
    } catch {
      await writeActiveChurchCookie(churchId);
    }
  }

  revalidatePath("/", "layout");
  redirect("/home");
}
