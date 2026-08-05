"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AuditAction, AuditEntityType } from "@/lib/audit/actions";
import { writePlatformAdminAction } from "@/lib/platform/audit";
import {
  requirePlatformAccount,
  requirePlatformMfa,
  requirePlatformPermission,
  requireRecentPlatformAuthentication,
} from "@/lib/platform/auth";
import {
  applyPlatformPlanChange,
  cancelPlatformChurchSubscription,
  previewPlatformPlanChange,
  restorePlatformChurchSubscription,
} from "@/lib/platform/subscription-admin";
import {
  endPlatformSupportSession,
  lookupChurchesForSupportAccess,
  startPlatformSupportSession,
} from "@/lib/platform/support-sessions";
import type { DowngradeImpactReport } from "@/lib/billing/types";
import {
  PLATFORM_BOOTSTRAP_MIN_PASSWORD_LENGTH,
} from "@/lib/platform/bootstrap";
import {
  acceptPlatformInvitation,
  createPlatformInvitation,
  getPlatformInvitationByToken,
  revokePlatformInvitation,
} from "@/lib/platform/invitation-service";
import {
  validatePlatformAcceptPasswordForm,
  validatePlatformInviteForm,
  type PlatformInviteActionState,
} from "@/lib/platform/invitations";
import { requirePlatformAdminClient } from "@/lib/platform/queries";
import { PLATFORM_SETUP_MFA_PATH } from "@/lib/platform/routes";
import { createClient } from "@/lib/supabase/server";
import {
  validatePassword,
  validatePasswordConfirmation,
} from "@/lib/auth/validation";

export type PlatformSetupActionState = {
  error?: string | null;
  success?: boolean;
  fieldErrors?: Record<string, string>;
};

export async function invitePlatformAccountAction(
  _prev: PlatformInviteActionState,
  formData: FormData,
): Promise<PlatformInviteActionState> {
  try {
    const context = await requirePlatformPermission("platform.accounts.create");
    const validation = validatePlatformInviteForm(
      formData,
      context.permissions,
    );
    if (validation.fieldErrors || !validation.data) {
      return { fieldErrors: validation.fieldErrors };
    }

    const result = await createPlatformInvitation({
      context,
      data: validation.data,
    });

    revalidatePath("/platform/accounts");
    revalidatePath("/platform/accounts/new");

    return {
      success: true,
      invitationId: result.invitation.id,
      invitationUrl: result.invitationUrl,
      emailSent: result.emailSent,
      emailError: result.emailError,
    };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to create platform invitation.",
    };
  }
}

export async function revokePlatformInvitationAction(
  formData: FormData,
): Promise<void> {
  const invitationId = String(formData.get("invitation_id") ?? "").trim();
  if (!invitationId) return;

  const context = await requirePlatformPermission("platform.accounts.update");
  await revokePlatformInvitation({
    context,
    invitationId,
    reason: String(formData.get("reason") ?? "").trim() || undefined,
  });
  revalidatePath("/platform/accounts");
  revalidatePath("/platform/accounts/new");
}

export async function acceptPlatformInvitationAction(
  _prev: PlatformInviteActionState,
  formData: FormData,
): Promise<PlatformInviteActionState> {
  const token = String(formData.get("token") ?? "").trim();
  if (!token) {
    return { error: "Missing invitation token." };
  }

  try {
    const invitation = await getPlatformInvitationByToken(token);
    if (!invitation || invitation.status !== "pending") {
      return {
        error: invitation
          ? `This invitation is ${invitation.status}.`
          : "Invitation not found.",
      };
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      await acceptPlatformInvitation({
        token,
        existingUserId: user.id,
      });
      redirect(PLATFORM_SETUP_MFA_PATH);
    }

    const passwordValidation = validatePlatformAcceptPasswordForm(formData);
    if (passwordValidation.fieldErrors || !passwordValidation.data) {
      return { fieldErrors: passwordValidation.fieldErrors };
    }

    const accepted = await acceptPlatformInvitation({
      token,
      password: passwordValidation.data.password,
    });

    // Sign the new user in with the password they just chose.
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: accepted.email,
      password: passwordValidation.data.password,
    });

    if (signInError) {
      return {
        success: true,
        error:
          "Account created. Sign in with your email and password, then continue MFA setup.",
      };
    }

    redirect(PLATFORM_SETUP_MFA_PATH);
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to accept this invitation.",
    };
  }
}

export async function changePlatformPasswordAction(
  _prev: PlatformSetupActionState,
  formData: FormData,
): Promise<PlatformSetupActionState> {
  try {
    const { user, account } = await requirePlatformAccount();
    const currentPassword = String(formData.get("current_password") ?? "");
    const password = String(formData.get("password") ?? "");
    const confirm = String(formData.get("confirm_password") ?? "");

    const fieldErrors: Record<string, string> = {};
    if (!currentPassword) {
      fieldErrors.current_password = "Current password is required.";
    }

    const passwordError = validatePassword(password);
    if (passwordError) fieldErrors.password = passwordError;
    if (
      password &&
      password.length < PLATFORM_BOOTSTRAP_MIN_PASSWORD_LENGTH
    ) {
      fieldErrors.password = `Password must be at least ${PLATFORM_BOOTSTRAP_MIN_PASSWORD_LENGTH} characters.`;
    }
    const confirmError = validatePasswordConfirmation(password, confirm);
    if (confirmError) fieldErrors.confirm_password = confirmError;

    if (Object.keys(fieldErrors).length > 0) {
      return { fieldErrors };
    }

    const supabase = await createClient();
    const email = user.email || account.email_snapshot;
    const { error: reauthError } = await supabase.auth.signInWithPassword({
      email,
      password: currentPassword,
    });
    if (reauthError) {
      return {
        fieldErrors: {
          current_password: "Current password is incorrect.",
        },
      };
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password,
    });
    if (updateError) {
      return {
        error: updateError.message || "Unable to update password.",
      };
    }

    const admin = requirePlatformAdminClient();
    await admin
      .from("platform_accounts")
      .update({
        must_change_password: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", account.id);

    await writePlatformAdminAction(
      {
        platformAccountId: account.id,
        actorUserId: user.id,
        action: AuditAction.PLATFORM_ACCOUNT_UPDATED,
        targetType: AuditEntityType.PLATFORM_ACCOUNT,
        targetId: account.id,
        reason: "Platform password changed",
        metadata: { must_change_password: false },
      },
      { client: admin },
    );

    redirect(PLATFORM_SETUP_MFA_PATH);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "digest" in error &&
      String((error as { digest?: string }).digest).startsWith("NEXT_REDIRECT")
    ) {
      throw error;
    }
    return {
      error:
        error instanceof Error ? error.message : "Unable to change password.",
    };
  }
}

export async function completePlatformMfaSetupAction(): Promise<PlatformSetupActionState> {
  try {
    const context = await requirePlatformAccount();
    if (context.account.must_change_password) {
      return { error: "Change your password before completing MFA setup." };
    }

    const { data, error } =
      await context.supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error) {
      return { error: error.message || "Unable to verify MFA status." };
    }

    if (data.currentLevel !== "aal2") {
      return {
        error:
          "Enroll and verify an authenticator first, then click Complete MFA setup.",
      };
    }

    const admin = requirePlatformAdminClient();
    await admin
      .from("platform_accounts")
      .update({
        mfa_verified_at: new Date().toISOString(),
        mfa_required: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", context.account.id);

    await writePlatformAdminAction(
      {
        platformAccountId: context.account.id,
        actorUserId: context.user.id,
        action: AuditAction.PLATFORM_MFA_ENROLLED,
        targetType: AuditEntityType.PLATFORM_ACCOUNT,
        targetId: context.account.id,
        reason: "Platform MFA enrollment completed",
        metadata: { aal: "aal2" },
      },
      { client: admin },
    );

    redirect("/platform");
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "digest" in error &&
      String((error as { digest?: string }).digest).startsWith("NEXT_REDIRECT")
    ) {
      throw error;
    }
    return {
      error:
        error instanceof Error ? error.message : "Unable to complete MFA setup.",
    };
  }
}

/** Used by MFA page to start TOTP enrollment. */
export async function startPlatformMfaEnrollmentAction(): Promise<{
  error?: string;
  factorId?: string;
  qrCode?: string;
  secret?: string;
}> {
  try {
    await requirePlatformAccount();
    const supabase = await createClient();
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "Platform authenticator",
    });
    if (error || !data) {
      return { error: error?.message || "Unable to start MFA enrollment." };
    }
    return {
      factorId: data.id,
      qrCode: data.totp.qr_code,
      secret: data.totp.secret,
    };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to start MFA enrollment.",
    };
  }
}

export async function verifyPlatformMfaEnrollmentAction(
  _prev: PlatformSetupActionState & {
    factorId?: string;
    qrCode?: string;
    secret?: string;
  },
  formData: FormData,
): Promise<
  PlatformSetupActionState & {
    factorId?: string;
    qrCode?: string;
    secret?: string;
  }
> {
  const factorId = String(formData.get("factor_id") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim();
  const qrCode = String(formData.get("qr_code") ?? "");
  const secret = String(formData.get("secret") ?? "");

  if (!factorId || !code) {
    return {
      error: "Enter the verification code from your authenticator app.",
      factorId,
      qrCode,
      secret,
    };
  }

  try {
    const { account, user } = await requirePlatformAccount();
    const supabase = await createClient();
    const challenge = await supabase.auth.mfa.challenge({ factorId });
    if (challenge.error || !challenge.data) {
      return {
        error: challenge.error?.message || "Unable to create MFA challenge.",
        factorId,
        qrCode,
        secret,
      };
    }

    const verified = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.data.id,
      code,
    });
    if (verified.error) {
      return {
        error: verified.error.message || "Invalid verification code.",
        factorId,
        qrCode,
        secret,
      };
    }

    const admin = requirePlatformAdminClient();
    await admin
      .from("platform_accounts")
      .update({
        mfa_verified_at: new Date().toISOString(),
        mfa_required: true,
        must_change_password: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", account.id);

    await writePlatformAdminAction(
      {
        platformAccountId: account.id,
        actorUserId: user.id,
        action: AuditAction.PLATFORM_MFA_ENROLLED,
        targetType: AuditEntityType.PLATFORM_ACCOUNT,
        targetId: account.id,
        reason: "Platform TOTP factor verified",
        metadata: { factor_id: factorId },
      },
      { client: admin },
    );

    // Ensure session is elevated; then enter console.
    await requirePlatformMfa().catch(() => undefined);
    redirect("/platform");
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "digest" in error &&
      String((error as { digest?: string }).digest).startsWith("NEXT_REDIRECT")
    ) {
      throw error;
    }
    return {
      error:
        error instanceof Error ? error.message : "Unable to verify MFA code.",
      factorId,
      qrCode,
      secret,
    };
  }
}

export type PlatformSubscriptionActionState = {
  error?: string | null;
  success?: boolean;
  message?: string | null;
  impact?: DowngradeImpactReport | null;
  notifiedOwners?: number;
};

export async function previewPlatformPlanChangeAction(
  churchId: string,
  planKey: string,
): Promise<PlatformSubscriptionActionState> {
  try {
    await requirePlatformPermission("subscriptions.read_all");
    const impact = await previewPlatformPlanChange({
      churchId,
      targetPlanKey: planKey,
    });
    return { success: true, impact };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to preview plan change.",
    };
  }
}

export async function applyPlatformPlanChangeAction(
  _prev: PlatformSubscriptionActionState,
  formData: FormData,
): Promise<PlatformSubscriptionActionState> {
  try {
    await requireRecentPlatformAuthentication();
    const context = await requirePlatformPermission("subscriptions.change_plan");

    const churchId = String(formData.get("organization_id") ?? "").trim();
    const planKey = String(formData.get("plan_key") ?? "").trim();
    const reason = String(formData.get("reason") ?? "").trim();
    const confirmDowngrade = formData.get("confirm_downgrade") === "1";
    const typedConfirmation = String(
      formData.get("typed_confirmation") ?? "",
    ).trim();

    if (!churchId || !planKey) {
      return { error: "Church and plan are required." };
    }

    const result = await applyPlatformPlanChange({
      context,
      churchId,
      targetPlanKey: planKey,
      reason,
      confirmDowngrade,
      typedConfirmation,
    });

    revalidatePath(`/platform/churches/${churchId}`);
    revalidatePath(`/platform/churches/${churchId}/subscription`);
    revalidatePath("/platform/subscriptions");
    revalidatePath("/platform/audit");

    return {
      success: true,
      message:
        result.notifiedOwners > 0
          ? `${result.message} Notified ${result.notifiedOwners} owner(s).`
          : result.message,
      impact: result.impact,
      notifiedOwners: result.notifiedOwners,
    };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to apply plan change.",
    };
  }
}

export async function cancelPlatformSubscriptionAction(
  _prev: PlatformSubscriptionActionState,
  formData: FormData,
): Promise<PlatformSubscriptionActionState> {
  try {
    await requireRecentPlatformAuthentication();
    const context = await requirePlatformPermission("subscriptions.cancel");

    const churchId = String(formData.get("organization_id") ?? "").trim();
    const reason = String(formData.get("reason") ?? "").trim();
    const confirm = formData.get("confirm") === "1";
    const typedConfirmation = String(
      formData.get("typed_confirmation") ?? "",
    ).trim();

    if (!churchId) return { error: "Church is required." };

    const result = await cancelPlatformChurchSubscription({
      context,
      churchId,
      reason,
      confirm,
      typedConfirmation,
    });

    revalidatePath(`/platform/churches/${churchId}`);
    revalidatePath(`/platform/churches/${churchId}/subscription`);
    revalidatePath("/platform/subscriptions");
    revalidatePath("/platform/audit");

    return { success: true, message: result.message };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to cancel subscription.",
    };
  }
}

export async function restorePlatformSubscriptionAction(
  _prev: PlatformSubscriptionActionState,
  formData: FormData,
): Promise<PlatformSubscriptionActionState> {
  try {
    await requireRecentPlatformAuthentication();
    const context = await requirePlatformPermission("subscriptions.restore");

    const churchId = String(formData.get("organization_id") ?? "").trim();
    const reason = String(formData.get("reason") ?? "").trim();
    if (!churchId) return { error: "Church is required." };

    const result = await restorePlatformChurchSubscription({
      context,
      churchId,
      reason,
    });

    revalidatePath(`/platform/churches/${churchId}`);
    revalidatePath(`/platform/churches/${churchId}/subscription`);
    revalidatePath("/platform/subscriptions");
    revalidatePath("/platform/audit");

    return { success: true, message: result.message };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to restore subscription.",
    };
  }
}

export type PlatformSupportActionState = {
  error?: string | null;
  success?: boolean;
  message?: string | null;
  sessionId?: string;
  churches?: Array<{
    id: string;
    name: string;
    slug: string | null;
    status: string | null;
  }>;
};

export async function startPlatformSupportSessionAction(
  _prev: PlatformSupportActionState,
  formData: FormData,
): Promise<PlatformSupportActionState> {
  try {
    await requireRecentPlatformAuthentication();
    const context = await requirePlatformPermission("churches.support_access");

    const churchId = String(formData.get("organization_id") ?? "").trim();
    if (!churchId) return { error: "Select a church." };

    const session = await startPlatformSupportSession({
      context,
      churchId,
      reason: String(formData.get("reason") ?? ""),
      ticketReference: String(formData.get("ticket_reference") ?? ""),
      accessType: String(formData.get("access_type") ?? "read_only"),
      durationMinutes: Number(formData.get("duration_minutes") ?? 60),
    });

    revalidatePath("/platform");
    revalidatePath("/platform/support");
    revalidatePath(`/platform/churches/${churchId}`);
    revalidatePath("/platform/audit");

    return {
      success: true,
      message: `Support session started for ${session.church_name}.`,
      sessionId: session.id,
    };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to start support session.",
    };
  }
}

export async function endPlatformSupportSessionAction(
  _prev: PlatformSupportActionState,
  formData: FormData,
): Promise<PlatformSupportActionState> {
  try {
    const context = await requirePlatformPermission("churches.support_access");
    await endPlatformSupportSession({
      context,
      sessionId: String(formData.get("session_id") ?? "").trim() || null,
      reason: String(formData.get("reason") ?? "").trim() || null,
    });

    revalidatePath("/platform");
    revalidatePath("/platform/support");
    revalidatePath("/platform/churches");
    revalidatePath("/platform/audit");

    return { success: true, message: "Support session ended." };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to end support session.",
    };
  }
}

/** Form-action friendly wrapper (no useActionState prev arg). */
export async function endPlatformSupportSessionFormAction(
  formData: FormData,
): Promise<void> {
  await endPlatformSupportSessionAction({}, formData);
}

export async function lookupChurchesForSupportAction(
  query: string,
): Promise<PlatformSupportActionState> {
  try {
    const context = await requirePlatformPermission("churches.support_access");
    const churches = await lookupChurchesForSupportAccess({
      context,
      query,
    });
    return { success: true, churches };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to look up churches.",
    };
  }
}
