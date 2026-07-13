"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { writeActiveChurchCookie } from "@/lib/church/cookie";
import { setActiveChurchForUser } from "@/lib/church/context";
import type { InviteActionState } from "@/lib/church/invitations";
import { createClient } from "@/lib/supabase/server";

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
    if (message.includes("function") && message.includes("does not exist")) {
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
  redirect("/dashboard");
}
