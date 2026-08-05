"use server";

import { revalidatePath } from "next/cache";
import { AuditAction, AuditEntityType } from "@/lib/audit/actions";
import { getRequestIpAddress, writeAuditLog } from "@/lib/audit/log";
import {
  ChurchAccessError,
  getAuthenticatedUserWithChurch,
} from "@/lib/church/auth";
import { canManageSafetyConcernSettings } from "@/lib/safety-concerns/permissions";
import { updateSafetyConcernChurchSettings } from "@/lib/safety-concerns/queries";
import type { SafetyConcernActionState } from "@/lib/safety-concerns/types";
import { validateSafetyConcernChurchSettingsForm } from "@/lib/safety-concerns/validation";
import { createClient } from "@/lib/supabase/server";
import { FEATURE_KEYS } from "@/lib/subscriptions/feature-keys";
import { requireFeature } from "@/lib/subscriptions/resolver";

export async function updateSafetyConcernChurchSettingsAction(
  _prev: SafetyConcernActionState,
  formData: FormData,
): Promise<SafetyConcernActionState> {
  try {
    const { user, church, membership } = await getAuthenticatedUserWithChurch();
    if (!canManageSafetyConcernSettings(membership.role)) {
      throw new ChurchAccessError(
        "You do not have permission to manage Safety Concern settings.",
      );
    }

    await requireFeature({
      organizationId: church.id,
      featureKey: FEATURE_KEYS.SAFETY_CONCERN_PROFILES,
    });

    const validated = validateSafetyConcernChurchSettingsForm(formData);
    if (!validated.data) {
      return {
        error: validated.error ?? "Invalid settings.",
        fieldErrors: validated.fieldErrors,
      };
    }

    const { error } = await updateSafetyConcernChurchSettings(
      church.id,
      validated.data,
    );
    if (error) return { error };

    const supabase = await createClient();
    await writeAuditLog(supabase, {
      organizationId: church.id,
      userId: user.id,
      action: AuditAction.SAFETY_CONCERN_SETTINGS_UPDATED,
      entityType: AuditEntityType.SAFETY_CONCERN_SETTINGS,
      entityId: church.id,
      metadata: {
        allow_security_member_view: validated.data.allow_security_member_view,
        review_interval_days: validated.data.review_interval_days,
        require_linked_incident: validated.data.require_linked_incident,
        require_photo_to_activate: validated.data.require_photo_to_activate,
      },
      ipAddress: await getRequestIpAddress(),
    });

    revalidatePath("/settings/safety-concerns");
    revalidatePath("/safety-concerns");
    revalidatePath("/dashboard");
    return { success: true };
  } catch (error) {
    if (error instanceof ChurchAccessError) {
      return { error: error.message };
    }
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to update Safety Concern settings.",
    };
  }
}
