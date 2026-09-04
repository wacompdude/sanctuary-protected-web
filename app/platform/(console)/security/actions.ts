"use server";

import { revalidatePath } from "next/cache";
import { AuditAction, AuditEntityType } from "@/lib/audit/actions";
import { authorizeMfaPolicyManagement } from "@/lib/mfa/authorize-policy";
import { isMfaEmergencyOverrideActive } from "@/lib/mfa/policy";
import {
  getOrganizationSecuritySettings,
  getPlatformSecuritySettings,
  setOrganizationMfaEnabled,
  setOrganizationMfaReauthAfter,
  setPlatformMfaEnabled,
  setPlatformMfaReauthAfter,
} from "@/lib/mfa/policy-settings";
import { writePlatformAdminAction } from "@/lib/platform/audit";
import { getDeployedEnvironmentLabel } from "@/lib/platform/environment";

export type MfaPolicyActionState = {
  error?: string;
  success?: boolean;
  message?: string;
};

function emergencyMetadata() {
  return {
    emergency_override_active: isMfaEmergencyOverrideActive(),
    environment: getDeployedEnvironmentLabel(),
  };
}

export async function updatePlatformMfaPolicyAction(
  _prev: MfaPolicyActionState,
  formData: FormData,
): Promise<MfaPolicyActionState> {
  try {
    const context = await authorizeMfaPolicyManagement({ scope: "platform" });
    const enabled = String(formData.get("mfa_enabled") ?? "") === "true";
    const reason = String(formData.get("reason") ?? "").trim() || null;

    const previous = await getPlatformSecuritySettings();
    if (previous.mfaEnabled === enabled) {
      return { success: true };
    }

    await setPlatformMfaEnabled({
      enabled,
      actorUserId: context.user.id,
    });

    await writePlatformAdminAction({
      platformAccountId: context.account.id,
      actorUserId: context.user.id,
      action: enabled
        ? AuditAction.PLATFORM_MFA_ENABLED
        : AuditAction.PLATFORM_MFA_DISABLED,
      targetType: AuditEntityType.PLATFORM_SECURITY_SETTINGS,
      targetId: "1",
      reason,
      metadata: {
        previous_value: previous.mfaEnabled,
        new_value: enabled,
        ...emergencyMetadata(),
      },
    });

    revalidatePath("/platform/security");
    revalidatePath("/platform");
    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to update platform MFA policy.",
    };
  }
}

export async function updateOrganizationMfaPolicyAction(
  _prev: MfaPolicyActionState,
  formData: FormData,
): Promise<MfaPolicyActionState> {
  try {
    const organizationId = String(formData.get("organization_id") ?? "").trim();
    const context = await authorizeMfaPolicyManagement({
      scope: "organization",
      organizationId,
    });
    const enabled = String(formData.get("mfa_enabled") ?? "") === "true";

    const previous = await getOrganizationSecuritySettings(organizationId);
    if (previous.mfaEnabled === enabled) {
      return { success: true };
    }

    await setOrganizationMfaEnabled({ organizationId, enabled });

    await writePlatformAdminAction({
      platformAccountId: context.account.id,
      actorUserId: context.user.id,
      action: enabled
        ? AuditAction.ORGANIZATION_MFA_ENABLED
        : AuditAction.ORGANIZATION_MFA_DISABLED,
      targetType: AuditEntityType.ORGANIZATION_SECURITY_SETTINGS,
      targetId: organizationId,
      organizationId,
      metadata: {
        previous_value: previous.mfaEnabled,
        new_value: enabled,
        ...emergencyMetadata(),
      },
    });

    revalidatePath("/platform/security");
    revalidatePath(`/platform/churches/${organizationId}`);
    revalidatePath(`/platform/churches/${organizationId}/security`);
    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to update organization MFA policy.",
    };
  }
}

export async function requirePlatformMfaImmediatelyAction(
  _prev: MfaPolicyActionState,
  formData: FormData,
): Promise<MfaPolicyActionState> {
  try {
    const context = await authorizeMfaPolicyManagement({ scope: "platform" });
    const reason = String(formData.get("reason") ?? "").trim() || null;
    const updated = await setPlatformMfaReauthAfter({
      actorUserId: context.user.id,
    });

    await writePlatformAdminAction({
      platformAccountId: context.account.id,
      actorUserId: context.user.id,
      action: AuditAction.PLATFORM_MFA_REAUTH_REQUIRED,
      targetType: AuditEntityType.PLATFORM_SECURITY_SETTINGS,
      targetId: "1",
      reason,
      metadata: {
        scope: "platform",
        mfa_reauth_after: updated.mfaReauthAfter,
        ...emergencyMetadata(),
      },
    });

    revalidatePath("/platform/security");
    revalidatePath("/platform");
    return {
      success: true,
      message:
        "Active sessions must satisfy the current MFA policy before continuing.",
    };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to require MFA immediately.",
    };
  }
}

export async function requireOrganizationMfaImmediatelyAction(
  _prev: MfaPolicyActionState,
  formData: FormData,
): Promise<MfaPolicyActionState> {
  try {
    const organizationId = String(formData.get("organization_id") ?? "").trim();
    const context = await authorizeMfaPolicyManagement({
      scope: "organization",
      organizationId,
    });
    const reason = String(formData.get("reason") ?? "").trim() || null;
    const updated = await setOrganizationMfaReauthAfter({ organizationId });

    await writePlatformAdminAction({
      platformAccountId: context.account.id,
      actorUserId: context.user.id,
      action: AuditAction.ORGANIZATION_MFA_REAUTH_REQUIRED,
      targetType: AuditEntityType.ORGANIZATION_SECURITY_SETTINGS,
      targetId: organizationId,
      organizationId,
      reason,
      metadata: {
        scope: "organization",
        mfa_reauth_after: updated.mfaReauthAfter,
        ...emergencyMetadata(),
      },
    });

    revalidatePath("/platform/security");
    revalidatePath(`/platform/churches/${organizationId}/security`);
    return {
      success: true,
      message:
        "Users accessing this organization must satisfy its MFA policy before continuing.",
    };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to require MFA immediately.",
    };
  }
}
