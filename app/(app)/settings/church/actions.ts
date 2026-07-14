"use server";

import { revalidatePath } from "next/cache";
import { getAuthenticatedUserWithChurch } from "@/lib/church/auth";
import { AuditAction } from "@/lib/audit/actions";
import {
  auditChurchAccountStatusChanged,
  auditChurchSettingsUpdated,
} from "@/lib/audit/church-events";
import type { ActionState } from "@/lib/church/types";
import {
  canManageChurchAccountStatus,
  canManageChurchSettings,
  changedKeys,
  CHURCH_SETTINGS_SELECT,
  migrationHintFromError,
  type ChurchSettingsRecord,
  validateAccountStatusAction,
  validateAddressSettings,
  validateBrandingSettings,
  validateContactSettings,
  validateGeneralSettings,
  validatePreferenceSettings,
  validateSecuritySettings,
} from "@/lib/church/settings";
import {
  CHURCH_BRANDING_BUCKET,
  LOGO_ALLOWED_MIME,
  LOGO_MAX_BYTES,
  churchLogoObjectPath,
  isChurchBrandingStoragePath,
} from "@/lib/church/logo-storage";

async function requireSettingsEditor() {
  const context = await getAuthenticatedUserWithChurch();
  if (!canManageChurchSettings(context.membership.role)) {
    return {
      error: "You do not have permission to edit church settings.",
    } as const;
  }
  return { context } as const;
}

async function loadChurchRow(
  supabase: Awaited<
    ReturnType<typeof getAuthenticatedUserWithChurch>
  >["supabase"],
  churchId: string,
): Promise<{ row?: ChurchSettingsRecord; error?: string }> {
  const { data, error } = await supabase
    .from("churches")
    .select(CHURCH_SETTINGS_SELECT)
    .eq("id", churchId)
    .maybeSingle();

  if (error) {
    return {
      error:
        migrationHintFromError(error.message) ??
        "Unable to load church settings.",
    };
  }
  if (!data) {
    return { error: "Church not found." };
  }
  return { row: data as unknown as ChurchSettingsRecord };
}

function safeUpdateError(message: string): string {
  return (
    migrationHintFromError(message) ??
    (message.includes("churches_slug_key") || message.includes("duplicate key")
      ? "That slug is already in use. Choose a different one."
      : message.includes("churches_year_established_check")
        ? "Year established is outside the allowed range."
        : message.includes("churches_primary_brand_color_check") ||
            message.includes("churches_secondary_brand_color_check")
          ? "Brand colors must be hex values like #1A6B4A."
          : message.includes("churches_incident_retention_days_check")
            ? "Incident retention days are outside the allowed range."
            : message.includes("churches_certification_warning_days_check")
              ? "Certification warning days must be between 1 and 365."
              : message.includes("FORBIDDEN")
                ? "You do not have permission to perform that action."
                : "Unable to save church settings.")
  );
}

async function updateChurchSection(params: {
  patch: Record<string, unknown>;
  before: Record<string, unknown>;
  action:
    | typeof AuditAction.CHURCH_SETTINGS_GENERAL_UPDATED
    | typeof AuditAction.CHURCH_SETTINGS_CONTACT_UPDATED
    | typeof AuditAction.CHURCH_SETTINGS_ADDRESS_UPDATED
    | typeof AuditAction.CHURCH_SETTINGS_BRANDING_UPDATED
    | typeof AuditAction.CHURCH_SETTINGS_SECURITY_UPDATED
    | typeof AuditAction.CHURCH_SETTINGS_PREFERENCES_UPDATED
    | typeof AuditAction.CHURCH_LOGO_UPDATED;
}): Promise<ActionState> {
  try {
    const editor = await requireSettingsEditor();
    if ("error" in editor) return { error: editor.error };

    const { supabase, user, church } = editor.context;
    const changedFields = changedKeys(params.before, params.patch);
    if (changedFields.length === 0) {
      return { success: true };
    }

    const { error } = await supabase
      .from("churches")
      .update(params.patch)
      .eq("id", church.id);

    if (error) {
      return { error: safeUpdateError(error.message) };
    }

    await auditChurchSettingsUpdated(supabase, {
      churchId: church.id,
      userId: user.id,
      changedFields,
      action: params.action,
    });

    revalidatePath("/settings/church", "layout");
    revalidatePath("/", "layout");
    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to save church settings.",
    };
  }
}

export async function updateChurchGeneralSettings(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const validation = validateGeneralSettings(formData);
  if (validation.fieldErrors || !validation.data) {
    return { fieldErrors: validation.fieldErrors };
  }

  const editor = await requireSettingsEditor();
  if ("error" in editor) return { error: editor.error };
  const loaded = await loadChurchRow(
    editor.context.supabase,
    editor.context.church.id,
  );
  if (loaded.error || !loaded.row) return { error: loaded.error };

  return updateChurchSection({
    patch: validation.data,
    before: {
      name: loaded.row.name,
      display_name: loaded.row.display_name,
      slug: loaded.row.slug,
      denomination: loaded.row.denomination,
      year_established: loaded.row.year_established,
      description: loaded.row.description,
      primary_language: loaded.row.primary_language,
    },
    action: AuditAction.CHURCH_SETTINGS_GENERAL_UPDATED,
  });
}

export async function updateChurchContactSettings(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const validation = validateContactSettings(formData);
  if (validation.fieldErrors || !validation.data) {
    return { fieldErrors: validation.fieldErrors };
  }

  const editor = await requireSettingsEditor();
  if ("error" in editor) return { error: editor.error };
  const loaded = await loadChurchRow(
    editor.context.supabase,
    editor.context.church.id,
  );
  if (loaded.error || !loaded.row) return { error: loaded.error };

  return updateChurchSection({
    patch: validation.data,
    before: {
      primary_email: loaded.row.primary_email,
      phone: loaded.row.phone,
      website_url: loaded.row.website_url,
      emergency_contact_name: loaded.row.emergency_contact_name,
      emergency_contact_phone: loaded.row.emergency_contact_phone,
      secondary_emergency_contact_name:
        loaded.row.secondary_emergency_contact_name,
      secondary_emergency_contact_phone:
        loaded.row.secondary_emergency_contact_phone,
    },
    action: AuditAction.CHURCH_SETTINGS_CONTACT_UPDATED,
  });
}

export async function updateChurchAddressSettings(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const validation = validateAddressSettings(formData);
  if (validation.fieldErrors || !validation.data) {
    return { fieldErrors: validation.fieldErrors };
  }

  const editor = await requireSettingsEditor();
  if ("error" in editor) return { error: editor.error };
  const loaded = await loadChurchRow(
    editor.context.supabase,
    editor.context.church.id,
  );
  if (loaded.error || !loaded.row) return { error: loaded.error };

  return updateChurchSection({
    patch: validation.data,
    before: {
      address_line_1: loaded.row.address_line_1,
      address_line_2: loaded.row.address_line_2,
      city: loaded.row.city,
      state: loaded.row.state,
      postal_code: loaded.row.postal_code,
      country: loaded.row.country,
      timezone: loaded.row.timezone,
    },
    action: AuditAction.CHURCH_SETTINGS_ADDRESS_UPDATED,
  });
}

export async function updateChurchBrandingSettings(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const validation = validateBrandingSettings(formData);
  if (validation.fieldErrors || !validation.data) {
    return { fieldErrors: validation.fieldErrors };
  }

  const editor = await requireSettingsEditor();
  if ("error" in editor) return { error: editor.error };
  const loaded = await loadChurchRow(
    editor.context.supabase,
    editor.context.church.id,
  );
  if (loaded.error || !loaded.row) return { error: loaded.error };

  const brandingAction =
    validation.data.logo_path !== loaded.row.logo_path
      ? AuditAction.CHURCH_LOGO_UPDATED
      : AuditAction.CHURCH_SETTINGS_BRANDING_UPDATED;

  return updateChurchSection({
    patch: validation.data,
    before: {
      logo_path: loaded.row.logo_path,
      primary_brand_color: loaded.row.primary_brand_color,
      secondary_brand_color: loaded.row.secondary_brand_color,
    },
    action: brandingAction,
  });
}

export async function updateChurchSecuritySettings(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const validation = validateSecuritySettings(formData);
  if (validation.fieldErrors || !validation.data) {
    return { fieldErrors: validation.fieldErrors };
  }

  const editor = await requireSettingsEditor();
  if ("error" in editor) return { error: editor.error };
  const loaded = await loadChurchRow(
    editor.context.supabase,
    editor.context.church.id,
  );
  if (loaded.error || !loaded.row) return { error: loaded.error };

  return updateChurchSection({
    patch: validation.data,
    before: {
      default_emergency_phone: loaded.row.default_emergency_phone,
      police_non_emergency_phone: loaded.row.police_non_emergency_phone,
      fire_non_emergency_phone: loaded.row.fire_non_emergency_phone,
      nearest_hospital_name: loaded.row.nearest_hospital_name,
      nearest_hospital_phone: loaded.row.nearest_hospital_phone,
      nearest_hospital_address: loaded.row.nearest_hospital_address,
      default_emergency_notification_sender:
        loaded.row.default_emergency_notification_sender,
      incident_retention_days: loaded.row.incident_retention_days,
      require_incident_location: loaded.row.require_incident_location,
      require_incident_severity: loaded.row.require_incident_severity,
      require_incident_follow_up: loaded.row.require_incident_follow_up,
      allow_security_members_create_incidents:
        loaded.row.allow_security_members_create_incidents,
      allow_security_members_close_incidents:
        loaded.row.allow_security_members_close_incidents,
    },
    action: AuditAction.CHURCH_SETTINGS_SECURITY_UPDATED,
  });
}

export async function updateChurchPreferenceSettings(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const validation = validatePreferenceSettings(formData);
  if (validation.fieldErrors || !validation.data) {
    return { fieldErrors: validation.fieldErrors };
  }

  const editor = await requireSettingsEditor();
  if ("error" in editor) return { error: editor.error };
  const loaded = await loadChurchRow(
    editor.context.supabase,
    editor.context.church.id,
  );
  if (loaded.error || !loaded.row) return { error: loaded.error };

  const patch = {
    certification_warning_days: validation.data.certification_warning_days,
    settings: validation.data.preferences,
  };

  return updateChurchSection({
    patch,
    before: {
      certification_warning_days: loaded.row.certification_warning_days,
      settings: loaded.row.settings,
    },
    action: AuditAction.CHURCH_SETTINGS_PREFERENCES_UPDATED,
  });
}

export async function changeChurchAccountStatus(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const context = await getAuthenticatedUserWithChurch();
    if (!canManageChurchAccountStatus(context.membership.role)) {
      return { error: "Only church owners can change account status." };
    }

    const loaded = await loadChurchRow(
      context.supabase,
      context.church.id,
    );
    if (loaded.error || !loaded.row) return { error: loaded.error };

    const validation = validateAccountStatusAction(
      formData,
      loaded.row.name,
      loaded.row.status,
    );
    if (validation.error) return { error: validation.error };
    if (validation.fieldErrors || !validation.data) {
      return { fieldErrors: validation.fieldErrors };
    }

    const { error } = await context.supabase
      .from("churches")
      .update({ status: validation.data.nextStatus })
      .eq("id", context.church.id);

    if (error) {
      return { error: safeUpdateError(error.message) };
    }

    await auditChurchAccountStatusChanged(context.supabase, {
      churchId: context.church.id,
      userId: context.user.id,
      fromStatus: loaded.row.status,
      toStatus: validation.data.nextStatus,
    });

    revalidatePath("/settings/church", "layout");
    revalidatePath("/", "layout");
    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to change church account status.",
    };
  }
}

export async function uploadChurchLogo(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const editor = await requireSettingsEditor();
    if ("error" in editor) return { error: editor.error };

    const file = formData.get("logo");
    if (!(file instanceof File) || file.size === 0) {
      return { fieldErrors: { logo: "Choose an image file to upload." } };
    }

    if (!LOGO_ALLOWED_MIME.has(file.type)) {
      return {
        fieldErrors: {
          logo: "Use a PNG, JPEG, WebP, or GIF image.",
        },
      };
    }

    if (file.size > LOGO_MAX_BYTES) {
      return {
        fieldErrors: { logo: "Logo must be 2 MB or smaller." },
      };
    }

    const { supabase, user, church } = editor.context;
    const loaded = await loadChurchRow(supabase, church.id);
    if (loaded.error || !loaded.row) return { error: loaded.error };

    const objectPath = churchLogoObjectPath(church.id, file.type);
    const bytes = new Uint8Array(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from(CHURCH_BRANDING_BUCKET)
      .upload(objectPath, bytes, {
        upsert: true,
        contentType: file.type,
        cacheControl: "3600",
      });

    if (uploadError) {
      return {
        error:
          migrationHintFromError(uploadError.message) ??
          "Unable to upload the logo. Confirm storage migration 018 has been applied.",
      };
    }

    const { error: updateError } = await supabase
      .from("churches")
      .update({ logo_path: objectPath })
      .eq("id", church.id);

    if (updateError) {
      return { error: safeUpdateError(updateError.message) };
    }

    await auditChurchSettingsUpdated(supabase, {
      churchId: church.id,
      userId: user.id,
      changedFields: ["logo_path"],
      action: AuditAction.CHURCH_LOGO_UPDATED,
    });

    revalidatePath("/settings/church", "layout");
    revalidatePath("/", "layout");
    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Unable to upload the logo.",
    };
  }
}

export async function removeChurchLogo(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const editor = await requireSettingsEditor();
    if ("error" in editor) return { error: editor.error };

    const { supabase, user, church } = editor.context;
    const loaded = await loadChurchRow(supabase, church.id);
    if (loaded.error || !loaded.row) return { error: loaded.error };

    const currentPath = loaded.row.logo_path;
    if (
      currentPath &&
      isChurchBrandingStoragePath(currentPath, church.id)
    ) {
      await supabase.storage.from(CHURCH_BRANDING_BUCKET).remove([currentPath]);
    }

    const { error: updateError } = await supabase
      .from("churches")
      .update({ logo_path: null })
      .eq("id", church.id);

    if (updateError) {
      return { error: safeUpdateError(updateError.message) };
    }

    await auditChurchSettingsUpdated(supabase, {
      churchId: church.id,
      userId: user.id,
      changedFields: ["logo_path"],
      action: AuditAction.CHURCH_LOGO_UPDATED,
    });

    // formData reserved for future confirm flags
    void formData;

    revalidatePath("/settings/church", "layout");
    revalidatePath("/", "layout");
    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Unable to remove the logo.",
    };
  }
}

